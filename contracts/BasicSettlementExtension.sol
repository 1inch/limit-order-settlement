// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { IOrderMixin } from "@1inch/limit-order-protocol-contract/contracts/interfaces/IOrderMixin.sol";
import { SafeERC20 } from "@1inch/solidity-utils/contracts/libraries/SafeERC20.sol";
import { Address, AddressLib } from "@1inch/solidity-utils/contracts/libraries/AddressLib.sol";
import { BaseExtension } from "./BaseExtension.sol";
import { FeeBankCharger } from "./FeeBankCharger.sol";

/**
 * @title Basic Settlement contract
 * @notice Contract to execute limit orders settlement, created by Fusion mode.
 */
contract BasicSettlementExtension is BaseExtension, FeeBankCharger {
    using SafeERC20 for IERC20;
    using AddressLib for Address;

    error InvalidPriorityFee();
    error ResolverIsNotWhitelisted();

    uint256 private constant _TAKING_FEE_BASE = 1e9;
    uint256 private constant _ORDER_FEE_BASE_POINTS = 1e15;

    /**
     * @notice Initializes the contract.
     * @param limitOrderProtocol The limit order protocol contract.
     * @param token The token to charge protocol fees in.
     */
    constructor(IOrderMixin limitOrderProtocol, IERC20 token)
        BaseExtension(limitOrderProtocol)
        FeeBankCharger(token) {}

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
     * @return dataReturned The data remaining after parsing.
     */
    function _parseFeeData(
        bytes calldata extraData,
        uint256 orderMakingAmount,
        uint256 actualMakingAmount,
        uint256 actualTakingAmount
    ) internal pure virtual returns (uint256 resolverFee, address integrator, uint256 integrationFee, bytes calldata dataReturned) {
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
        dataReturned = extraData;
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
    function _isWhitelisted(bytes calldata whitelist, address resolver) internal view virtual returns (bool) {
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

    function _isPriorityFeeValid() internal view virtual returns(bool) {
        return true;
    }

    function _postInteraction(
        IOrderMixin.Order calldata order,
        bytes calldata /* extension */,
        bytes32 /* orderHash */,
        address taker,
        uint256 makingAmount,
        uint256 takingAmount,
        uint256 /* remainingMakingAmount */,
        bytes calldata extraData
    ) internal virtual override {
        (
            uint256 resolverFee,
            address integrator,
            uint256 integrationFee,
            bytes calldata dataReturned
        ) = _parseFeeData(extraData, order.makingAmount, makingAmount, takingAmount);

        if (!_isWhitelisted(dataReturned, taker)) revert ResolverIsNotWhitelisted();

        if (!_isPriorityFeeValid()) revert InvalidPriorityFee();

        _chargeFee(taker, resolverFee);
        if (integrationFee > 0) {
            IERC20(order.takerAsset.get()).safeTransferFrom(taker, integrator, integrationFee);
        }
    }
}
