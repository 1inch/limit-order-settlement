// SPDX-License-Identifier: MIT

pragma solidity 0.8.23;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { IOrderMixin } from "@1inch/limit-order-protocol-contract/contracts/interfaces/IOrderMixin.sol";
import { FeeTaker } from "@1inch/limit-order-protocol-contract/contracts/extensions/FeeTaker.sol";
import { IPostInteraction } from "@1inch/limit-order-protocol-contract/contracts/interfaces/IPostInteraction.sol";
import { MakerTraits, MakerTraitsLib } from "@1inch/limit-order-protocol-contract/contracts/libraries/MakerTraitsLib.sol";
import { SafeERC20 } from "@1inch/solidity-utils/contracts/libraries/SafeERC20.sol";
import { Address, AddressLib } from "@1inch/solidity-utils/contracts/libraries/AddressLib.sol";

/**
 * @title Simple Settlement contract
 * @notice Contract to execute limit orders settlement, created by Fusion mode.
 */
contract SimpleSettlement is FeeTaker {
    using AddressLib for Address;
    using SafeERC20 for IERC20;
    using MakerTraitsLib for MakerTraits;

    uint256 private constant _BASE_POINTS = 10_000_000; // 100%
    uint256 private constant _GAS_PRICE_BASE = 1_000_000; // 1000 means 1 Gwei

    error AllowedTimeViolation();
    error InvalidProtocolSurplusFee();

    /**
     * @notice Initializes the contract.
     * @param limitOrderProtocol The limit order protocol contract.
     * @param accessToken Contract address whose tokens allow filling limit orders with a fee for resolvers that are outside the whitelist.
     * @param weth The WETH address.
     * @param owner The owner of the contract.
     */
    constructor(address limitOrderProtocol, IERC20 accessToken, address weth, address owner)
        FeeTaker(limitOrderProtocol, accessToken, weth, owner)
    {}

    /**
     * @dev Adds dutch auction capabilities to the getter
     */
    function _getMakingAmount(
        IOrderMixin.Order calldata order,
        bytes calldata extension,
        bytes32 orderHash,
        address taker,
        uint256 takingAmount,
        uint256 remainingMakingAmount,
        bytes calldata extraData
    ) internal view override returns (uint256) {
        (uint256 rateBump, bytes calldata tail) = _getRateBump(extraData);
        return Math.mulDiv(
            super._getMakingAmount(order, extension, orderHash, taker, takingAmount, remainingMakingAmount, tail),
            _BASE_POINTS,
            _BASE_POINTS + rateBump
        );
    }

    /**
     * @dev Adds dutch auction capabilities to the getter
     */
    function _getTakingAmount(
        IOrderMixin.Order calldata order,
        bytes calldata extension,
        bytes32 orderHash,
        address taker,
        uint256 makingAmount,
        uint256 remainingMakingAmount,
        bytes calldata extraData
    ) internal view override returns (uint256) {
        (uint256 rateBump, bytes calldata tail) = _getRateBump(extraData);
        return Math.mulDiv(
            super._getTakingAmount(order, extension, orderHash, taker, makingAmount, remainingMakingAmount, tail),
            _BASE_POINTS + rateBump,
            _BASE_POINTS,
            Math.Rounding.Ceil
        );
    }

    /**
     * @dev Parses auction rate bump data from the `auctionDetails` field.
     * `gasBumpEstimate` and `gasPriceEstimate` are used to estimate the transaction costs
     * which are then offset from the auction rate bump.
     * @param auctionDetails AuctionDetails is a tightly packed struct of the following format:
     * ```
     * struct AuctionDetails {
     *     bytes3 gasBumpEstimate;
     *     bytes4 gasPriceEstimate;
     *     bytes4 auctionStartTime;
     *     bytes3 auctionDuration;
     *     bytes3 initialRateBump;
     *     (bytes3,bytes2)[N] pointsAndTimeDeltas;
     * }
     * ```
     * @return rateBump The rate bump.
     */
    function _getRateBump(bytes calldata auctionDetails) private view returns (uint256, bytes calldata) {
        unchecked {
            uint256 gasBumpEstimate = uint24(bytes3(auctionDetails[0:3]));
            uint256 gasPriceEstimate = uint32(bytes4(auctionDetails[3:7]));
            uint256 gasBump = gasBumpEstimate == 0 || gasPriceEstimate == 0 ? 0 : gasBumpEstimate * block.basefee / gasPriceEstimate / _GAS_PRICE_BASE;
            uint256 auctionStartTime = uint32(bytes4(auctionDetails[7:11]));
            uint256 auctionFinishTime = auctionStartTime + uint24(bytes3(auctionDetails[11:14]));
            uint256 initialRateBump = uint24(bytes3(auctionDetails[14:17]));
            (uint256 auctionBump, bytes calldata tail) = _getAuctionBump(auctionStartTime, auctionFinishTime, initialRateBump, auctionDetails[17:]);
            return (auctionBump > gasBump ? auctionBump - gasBump : 0, tail);
        }
    }

    /**
     * @dev Calculates auction price bump. Auction is represented as a piecewise linear function with `N` points.
     * Each point is represented as a pair of `(rateBump, timeDelta)`, where `rateBump` is the
     * rate bump in basis points and `timeDelta` is the time delta in seconds.
     * The rate bump is interpolated linearly between the points.
     * The last point is assumed to be `(0, auctionDuration)`.
     * @param auctionStartTime The time when the auction starts.
     * @param auctionFinishTime The time when the auction finishes.
     * @param initialRateBump The initial rate bump.
     * @param pointsAndTimeDeltas The points and time deltas structure.
     * @return The rate bump at the current time.
     */
    function _getAuctionBump(
        uint256 auctionStartTime, uint256 auctionFinishTime, uint256 initialRateBump, bytes calldata pointsAndTimeDeltas
    ) private view returns (uint256, bytes calldata) {
        unchecked {
            uint256 currentPointTime = auctionStartTime;
            uint256 currentRateBump = initialRateBump;
            uint256 pointsCount = uint8(pointsAndTimeDeltas[0]);
            pointsAndTimeDeltas = pointsAndTimeDeltas[1:];
            bytes calldata tail = pointsAndTimeDeltas[5 * pointsCount:];

            if (block.timestamp <= auctionStartTime) {
                return (initialRateBump, tail);
            } else if (block.timestamp >= auctionFinishTime) {
                return (0, tail);
            }

            for (uint256 i = 0; i < pointsCount; i++) {
                uint256 nextRateBump = uint24(bytes3(pointsAndTimeDeltas[:3]));
                uint256 nextPointTime = currentPointTime + uint16(bytes2(pointsAndTimeDeltas[3:5]));
                if (block.timestamp <= nextPointTime) {
                    return (((block.timestamp - currentPointTime) * nextRateBump + (nextPointTime - block.timestamp) * currentRateBump) / (nextPointTime - currentPointTime), tail);
                }
                currentRateBump = nextRateBump;
                currentPointTime = nextPointTime;
                pointsAndTimeDeltas = pointsAndTimeDeltas[5:];
            }
            return ((auctionFinishTime - block.timestamp) * currentRateBump / (auctionFinishTime - currentPointTime), tail);
        }
    }

    /**
     * @dev Validates whether the taker is whitelisted.
     * @param whitelistData Whitelist data is a tightly packed struct of the following format:
     * ```
     * 4 bytes - allowed time
     * 1 byte - size of the whitelist
     * (bytes12)[N] — taker whitelist
     * ```
     * Only 10 lowest bytes of the address are used for comparison.
     * @param taker The taker address to check.
     * @return isWhitelisted Whether the taker is whitelisted.
     * @return tail Remaining calldata.
     */
    function _isWhitelistedPostInteractionImpl(bytes calldata whitelistData, address taker) internal view override returns (bool isWhitelisted, bytes calldata tail) {
        unchecked {
            uint80 maskedTakerAddress = uint80(uint160(taker));
            uint256 allowedTime = uint32(bytes4(whitelistData));
            uint256 size = uint8(whitelistData[4]);
            bytes calldata whitelist = whitelistData[5:5 + 12 * size];
            tail = whitelistData[5 + 12 * size:];

            for (uint256 i = 0; i < size; i++) {
                uint80 whitelistedAddress = uint80(bytes10(whitelist));
                if (block.timestamp < allowedTime) {
                    revert AllowedTimeViolation();
                } else if (maskedTakerAddress == whitelistedAddress) {
                    return (true, tail);
                }
                allowedTime += uint16(bytes2(whitelist[10:])); // add next time delta
                whitelist = whitelist[12:];
            }
            if (block.timestamp < allowedTime) {
                revert AllowedTimeViolation();
            }
        }
    }

    /**
     * @notice See {IPostInteraction-postInteraction}.
     * @dev Takes the fee in taking tokens and transfers the rest to the maker.
     * `extraData` consists of:
     * 1 byte - flags
     * 20 bytes — integrator fee recipient
     * 20 bytes - protocol fee recipient
     * 20 bytes — receiver of taking tokens (optional, if not set, maker is used)
     * 2 bytes — integrator fee percentage (in 1e5)
     * 1 byte - integrator rev share percentage (in 1e2)
     * 2 bytes — resolver fee percentage (in 1e5)
     * 1 byte - whitelist discount numerator (in 1e2)
     * bytes — whitelist structure determined by `_isWhitelistedPostInteractionImpl` implementation
     * 32 bytes - estimatedTakingAmount
     * 1 byte - protocol fee percentage from surplus
     * bytes — custom data to call extra postInteraction (optional)
     */
    function _postInteraction(
        IOrderMixin.Order calldata order,
        bytes calldata extension,
        bytes32 orderHash,
        address taker,
        uint256 makingAmount,
        uint256 takingAmount,
        uint256 remainingMakingAmount,
        bytes calldata extraData
    ) internal virtual override {
        unchecked {
            bool customReceiver = extraData[0] & _CUSTOM_RECEIVER_FLAG == _CUSTOM_RECEIVER_FLAG;
            address integratorFeeRecipient = address(bytes20(extraData[1:21]));
            address protocolFeeRecipient = address(bytes20(extraData[21:41]));
            extraData = extraData[41:];

            address receiver = order.maker.get();
            if (customReceiver) {
                receiver = address(bytes20(extraData));
                extraData = extraData[20:];
            }
            (bool isWhitelisted, uint256 integratorFee, uint256 integratorShare, uint256 resolverFee, bytes calldata tail) = _parseFeeData(extraData, taker, _isWhitelistedPostInteractionImpl);
            if (!isWhitelisted && _ACCESS_TOKEN.balanceOf(taker) == 0) revert OnlyWhitelistOrAccessToken();

            uint256 integratorFeeAmount;
            uint256 protocolFeeAmount;

            {
                uint256 denominator = _BASE_1E5 + integratorFee + resolverFee;
                uint256 integratorFeeTotal = Math.mulDiv(takingAmount, integratorFee, denominator);
                integratorFeeAmount = Math.mulDiv(integratorFeeTotal, integratorShare, _BASE_1E2);
                protocolFeeAmount = Math.mulDiv(takingAmount, resolverFee, denominator) + integratorFeeTotal - integratorFeeAmount;
            }

            {
                uint256 estimatedTakingAmount = uint256(bytes32(tail));
                uint256 actualTakingAmount = takingAmount - integratorFeeAmount - protocolFeeAmount;
                if (actualTakingAmount > estimatedTakingAmount) {
                    uint256 protocolSurplusFee = uint16(bytes2(tail[32:]));
                    if (protocolSurplusFee > _BASE_1E2) revert InvalidProtocolSurplusFee();
                    protocolFeeAmount += Math.mulDiv(actualTakingAmount - estimatedTakingAmount, protocolSurplusFee, _BASE_1E2);
                }
                tail = tail[33:];
            }

            if (order.receiver.get() == address(this)) {
                if (order.takerAsset.get() == address(_WETH) && order.makerTraits.unwrapWeth()) {
                    if (integratorFeeAmount > 0) {
                        _sendEth(integratorFeeRecipient, integratorFeeAmount);
                    }
                    if (protocolFeeAmount > 0) {
                        _sendEth(protocolFeeRecipient, protocolFeeAmount);
                    }
                    _sendEth(receiver, takingAmount - integratorFeeAmount - protocolFeeAmount);
                } else {
                    if (integratorFeeAmount > 0) {
                        IERC20(order.takerAsset.get()).safeTransfer(integratorFeeRecipient, integratorFeeAmount);
                    }
                    if (protocolFeeAmount > 0) {
                        IERC20(order.takerAsset.get()).safeTransfer(protocolFeeRecipient, protocolFeeAmount);
                    }
                    IERC20(order.takerAsset.get()).safeTransfer(receiver, takingAmount - integratorFeeAmount - protocolFeeAmount);
                }
            } else if (integratorFeeAmount + protocolFeeAmount > 0) {
                revert InconsistentFee();
            }

            if (tail.length >= 20) {
                IPostInteraction(address(bytes20(tail))).postInteraction(order, extension, orderHash, taker, makingAmount, takingAmount, remainingMakingAmount, tail[20:]);
            }
        }
    }
}
