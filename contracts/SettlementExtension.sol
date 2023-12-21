// SPDX-License-Identifier: MIT

pragma solidity 0.8.23;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { IOrderMixin } from "@1inch/limit-order-protocol-contract/contracts/interfaces/IOrderMixin.sol";
import { IPostInteraction } from "@1inch/limit-order-protocol-contract/contracts/interfaces/IPostInteraction.sol";
import { IAmountGetter } from "@1inch/limit-order-protocol-contract/contracts/interfaces/IAmountGetter.sol";
import { SafeERC20 } from "@1inch/solidity-utils/contracts/libraries/SafeERC20.sol";
import { Address, AddressLib } from "@1inch/solidity-utils/contracts/libraries/AddressLib.sol";
import { FeeBankCharger } from "./FeeBankCharger.sol";

/**
 * @title Settlement contract
 * @notice Contract to execute limit orders settlement, created by Fusion mode.
 */
contract SettlementExtension is IPostInteraction, IAmountGetter, FeeBankCharger {
    using SafeERC20 for IERC20;
    using AddressLib for Address;

    error OnlyLimitOrderProtocol();
    error ResolverIsNotWhitelisted();
    error InvalidPriorityFee();

    uint256 private constant _TAKING_FEE_BASE = 1e9;
    uint256 private constant _ORDER_FEE_BASE_POINTS = 1e15;
    uint256 private constant _BASE_POINTS = 10_000_000; // 100%

    IOrderMixin private immutable _LIMIT_ORDER_PROTOCOL;

    /// @dev Modifier to check if the caller is the limit order protocol contract.
    modifier onlyLimitOrderProtocol {
        if (msg.sender != address(_LIMIT_ORDER_PROTOCOL)) revert OnlyLimitOrderProtocol();
        _;
    }

    /**
     * @notice Initializes the contract.
     * @param limitOrderProtocol The limit order protocol contract.
     * @param token The token to charge protocol fees in.
     */
    constructor(IOrderMixin limitOrderProtocol, IERC20 token)
        FeeBankCharger(token)
    {
        _LIMIT_ORDER_PROTOCOL = limitOrderProtocol;
    }

    function getMakingAmount(
        IOrderMixin.Order calldata order,
        bytes calldata /* extension */,
        bytes32 /* orderHash */,
        address /* taker */,
        uint256 takingAmount,
        uint256 /* remainingMakingAmount */,
        bytes calldata extraData
    ) external view returns (uint256) {
        uint256 rateBump = _getRateBump(extraData);
        return Math.mulDiv(order.makingAmount, takingAmount * _BASE_POINTS, order.takingAmount * (_BASE_POINTS + rateBump));
    }

    function getTakingAmount(
        IOrderMixin.Order calldata order,
        bytes calldata /* extension */,
        bytes32 /* orderHash */,
        address /* taker */,
        uint256 makingAmount,
        uint256 /* remainingMakingAmount */,
        bytes calldata extraData
    ) external view returns (uint256) {
        uint256 rateBump = _getRateBump(extraData);
        return Math.mulDiv(order.takingAmount, makingAmount * (_BASE_POINTS + rateBump), order.makingAmount * _BASE_POINTS, Math.Rounding.Ceil);
    }

    function postInteraction(
        IOrderMixin.Order calldata order,
        bytes calldata /* extension */,
        bytes32 /* orderHash */,
        address taker,
        uint256 makingAmount,
        uint256 takingAmount,
        uint256 /* remainingMakingAmount */,
        bytes calldata extraData
    ) external onlyLimitOrderProtocol {
        (uint256 resolverFee, address integrator, uint256 integrationFee, bytes calldata whitelist) = _parseFeeData(extraData, order.makingAmount, makingAmount, takingAmount);

        if (!_isWhitelisted(whitelist, taker)) revert ResolverIsNotWhitelisted();
        if (!_isPriorityFeeValid()) revert InvalidPriorityFee();

        _chargeFee(taker, resolverFee);
        if (integrationFee > 0) {
            IERC20(order.takerAsset.get()).safeTransferFrom(taker, integrator, integrationFee);
        }
    }

    /**
     * @dev Parses rate bump data from the `auctionDetails` field. Auction is represented as a
     * piecewise linear function with `N` points. Each point is represented as a pair of
     * `(rateBump, timeDelta)`, where `rateBump` is the rate bump in basis points and `timeDelta`
     * is the time delta in seconds. The rate bump is interpolated linearly between the points.
     * The last point is assumed to be `(0, auctionDuration)`.
     * @param auctionDetails AuctionDetails is a tihgtly packed struct of the following format:
     * ```
     * struct AuctionDetails {
     *     bytes4 auctionStartTime;
     *     bytes3 auctionDuration;
     *     bytes3 initialRateBump;
     *     (bytes3,bytes2)[N] pointsAndTimeDeltas;
     * }
     * ```
     * @return rateBump The rate bump.
     */
    function _getRateBump(bytes calldata auctionDetails) private view returns (uint256) {
        unchecked {
            uint256 auctionStartTime = uint32(bytes4(auctionDetails[0:4]));
            uint256 auctionFinishTime = auctionStartTime + uint24(bytes3(auctionDetails[4:7]));
            uint256 initialRateBump = uint24(bytes3(auctionDetails[7:10]));

            if (block.timestamp <= auctionStartTime) {
                return initialRateBump;
            } else if (block.timestamp >= auctionFinishTime) {
                return 0; // Means 0% bump
            }

            auctionDetails = auctionDetails[10:];
            uint256 pointsSize = auctionDetails.length / 5;
            uint256 currentPointTime = auctionStartTime;
            uint256 currentRateBump = initialRateBump;

            for (uint256 i = 0; i < pointsSize; i++) {
                uint256 nextRateBump = uint24(bytes3(auctionDetails[:3]));
                uint256 nextPointTime = currentPointTime + uint16(bytes2(auctionDetails[3:5]));
                if (block.timestamp <= nextPointTime) {
                    return ((block.timestamp - currentPointTime) * nextRateBump + (nextPointTime - block.timestamp) * currentRateBump) / (nextPointTime - currentPointTime);
                }
                currentRateBump = nextRateBump;
                currentPointTime = nextPointTime;
                auctionDetails = auctionDetails[5:];
            }
            return (auctionFinishTime - block.timestamp) * currentRateBump / (auctionFinishTime - currentPointTime);
        }
    }

    /**
     * @dev Parses fee data from the extraData field.
     * @param extraData ExtraData is a tihgtly packed struct of the following format:
     * ```
     * struct ExtraData {
     *     bytes1 feeTypes; 1 = resolverFee, 2 = integrationFee
     *     bytes4 resolverFee; optional
     *     bytes20 integrator; optional
     *     bytes4 integrationFee; optional
     *     bytes whitelist;
     * }
     * ```
     * @param orderMakingAmount The order making amount.
     * @param actualMakingAmount The actual making amount.
     * @param actualTakingAmount The actual taking amount.
     * @return resolverFee The resolver fee.
     * @return integrator The integrator address.
     * @return integrationFee The integration fee.
     * @return whitelist The whitelist.
     */
    function _parseFeeData(
        bytes calldata extraData,
        uint256 orderMakingAmount,
        uint256 actualMakingAmount,
        uint256 actualTakingAmount
    ) private pure returns (uint256 resolverFee, address integrator, uint256 integrationFee, bytes calldata whitelist) {
        bytes1 feeType = extraData[0];
        extraData = extraData[1:];
        if (feeType & 0x01 == 0x01) {
            // resolverFee enabled
            resolverFee = uint256(uint32(bytes4(extraData[:4]))) * _ORDER_FEE_BASE_POINTS * actualMakingAmount / orderMakingAmount;
            extraData = extraData[4:];
        }
        if (feeType & 0x02 == 0x02) {
            // integratorFee enabled
            integrator = address(bytes20(extraData[:20]));
            integrationFee = actualTakingAmount * uint256(uint32(bytes4(extraData[20:24]))) / _TAKING_FEE_BASE;
            extraData = extraData[24:];
        }
        whitelist = extraData;
    }

    /**
     * @dev Validates whether the resolver is whitelisted.
     * @param whitelist Whitelist is tighly packed struct of the following format:
     * ```
     * struct WhitelistDetails {
     *     bytes4 auctionStartTime;
     *     (bytes10,bytes2)[N] resolversAddressesAndTimeDeltas;
     * }
     * ```
     * @param resolver The resolver to check.
     * @return Whether the resolver is whitelisted.
     */
    function _isWhitelisted(bytes calldata whitelist, address resolver) private view returns (bool) {
        unchecked {
            uint256 allowedTime = uint32(bytes4(whitelist[0:4])); // initially set to auction start time
            whitelist = whitelist[4:];
            uint256 whitelistSize = whitelist.length / 12;
            uint80 maskedResolverAddress = uint80(uint160(resolver));
            for (uint256 i = 0; i < whitelistSize; i++) {
                uint80 whitelistedAddress = uint80(bytes10(whitelist[:10]));
                allowedTime += uint16(bytes2(whitelist[10:12])); // add next time delta
                if (maskedResolverAddress == whitelistedAddress) {
                    return allowedTime <= block.timestamp;
                } else if (allowedTime > block.timestamp) {
                    return false;
                }
                whitelist = whitelist[12:];
            }
            return false;
        }
    }

    /**
     * @dev Validates priority fee according to the spec
     * https://snapshot.org/#/1inch.eth/proposal/0xa040c60050147a0f67042ae024673e92e813b5d2c0f748abf70ddfa1ed107cbe
     * For blocks with baseFee <10.6 gwei – the priorityFee is capped at 70% of the baseFee.
     * For blocks with baseFee between 10.6 gwei and 104.1 gwei – the priorityFee is capped at 50% of the baseFee.
     * For blocks with baseFee >104.1 gwei – priorityFee is capped at 65% of the block’s baseFee.
     */
    function _isPriorityFeeValid() private view returns(bool) {
        unchecked {
            uint256 baseFee = block.basefee;
            uint256 priorityFee = tx.gasprice - baseFee;

            if (baseFee < 10.6 gwei) {
                return priorityFee * 100 <= baseFee * 70;
            } else if (baseFee > 104.1 gwei) {
                return priorityFee * 100 <= baseFee * 65;
            } else {
                return priorityFee * 2 <= baseFee;
            }
        }
    }
}
