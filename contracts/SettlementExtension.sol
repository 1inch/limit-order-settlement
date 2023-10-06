// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@1inch/limit-order-protocol-contract/contracts/interfaces/IPostInteraction.sol";
import "@1inch/limit-order-protocol-contract/contracts/interfaces/IAmountGetter.sol";
import "@1inch/solidity-utils/contracts/libraries/SafeERC20.sol";
import "./FeeBankCharger.sol";

/**
 * @title Settlement contract
 * @notice Contract to execute limit orders settlement, created by Fusion mode.
 */
contract SettlementExtension is IPostInteraction, IAmountGetter, FeeBankCharger {
    using SafeERC20 for IERC20;
    using AddressLib for Address;

    error OnlyLimitOrderProtocol();
    error ResolverIsNotWhitelisted();

    uint256 private constant _TAKING_FEE_BASE = 1e9;
    uint256 private constant _ORDER_FEE_BASE_POINTS = 1e15;
    uint256 private constant _BASE_POINTS = 10_000_000; // 100%
    uint256 private constant _RESOLVER_ADDRESS_MASK = 0xffffffffffffffffffff;

    IOrderMixin private immutable _limitOrderProtocol;

    /// @dev Modifier to check if the caller is the limit order protocol contract.
    modifier onlyLimitOrderProtocol {
        if (msg.sender != address(_limitOrderProtocol)) revert OnlyLimitOrderProtocol();
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
        _limitOrderProtocol = limitOrderProtocol;
    }

    /// struct AuctionDetails {
    ///     bytes4 auctionStartTime;
    ///     bytes3 auctionDuration;
    ///     bytes3 initialRateBump;
    ///     (bytes3,bytes2)[N] pointsAndTimeDeltas;
    /// }

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
        return order.makingAmount * takingAmount * (_BASE_POINTS + rateBump) / _BASE_POINTS / order.takingAmount;
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
        return Math.ceilDiv(order.takingAmount * makingAmount * (_BASE_POINTS + rateBump), _BASE_POINTS * order.makingAmount);
    }

    function _getRateBump(bytes calldata auctionDetails) private view returns (uint256) {
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
        }

        return (auctionFinishTime - block.timestamp) * currentRateBump / (auctionFinishTime - currentPointTime);
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
        _chargeFee(taker, resolverFee);
        if (integrationFee > 0) {
            IERC20(order.takerAsset.get()).safeTransferFrom(taker, integrator, integrationFee);
        }
    }

    /// struct FeeData {
    ///     bytes1 feeTypes; 1 = resolverFee, 2 = intergrationFee
    ///     bytes4 resolverFee; optional
    ///     bytes20 integrator; optional
    ///     bytes4 integrationFee; optional
    ///     bytes whitelist;
    /// }

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

    /// struct WhitelistDetails {
    ///     bytes4 auctionStartTime;
    ///     (bytes10,bytes2)[N] resolversAddressesAndTimeDeltas;
    /// }

    function _isWhitelisted(bytes calldata whitelist, address resolver) private view returns (bool result) {
        // solhint-disable-next-line no-inline-assembly
        assembly ("memory-safe") {
            let allowedTime := shr(224, calldataload(whitelist.offset))
            let maskedResolverAddress := and(resolver, _RESOLVER_ADDRESS_MASK)
            let cdEnd := add(whitelist.offset, whitelist.length)
            for { let cdPtr := add(whitelist.offset, 4) } lt(cdPtr, cdEnd) { cdPtr := add(cdPtr, 12) } {
                let data := calldataload(cdPtr)
                let whitelistedAddress := shr(176, data)
                allowedTime := add(allowedTime, and(shr(160, data), 0xffff))
                if eq(maskedResolverAddress, whitelistedAddress) {
                    result := sub(1, gt(allowedTime, timestamp()))
                    break
                }
            }
        }
    }
}
