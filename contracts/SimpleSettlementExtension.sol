// SPDX-License-Identifier: MIT

pragma solidity 0.8.23;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IOrderMixin } from "@1inch/limit-order-protocol-contract/contracts/interfaces/IOrderMixin.sol";
import { SafeERC20 } from "@1inch/solidity-utils/contracts/libraries/SafeERC20.sol";
import { Address, AddressLib } from "@1inch/solidity-utils/contracts/libraries/AddressLib.sol";
import { ExtensionBase } from "./ExtensionBase.sol";
import { FeeBankCharger } from "./FeeBankCharger.sol";

/**
 * @title Simple Settlement contract
 * @notice Contract to execute limit orders settlement, created by Fusion mode.
 */
contract SimpleSettlementExtension is ExtensionBase, FeeBankCharger {
    using SafeERC20 for IERC20;
    using AddressLib for Address;

    error ResolverIsNotWhitelisted();

    uint256 private constant _TAKING_FEE_BASE = 1e9;
    uint256 private constant _ORDER_FEE_BASE_POINTS = 1e15;

    /**
     * @notice Initializes the contract.
     * @param limitOrderProtocol The limit order protocol contract.
     * @param token The token to charge protocol fees in.
     */
    constructor(address limitOrderProtocol, IERC20 token) ExtensionBase(limitOrderProtocol) FeeBankCharger(token) {}

    /**
     * @dev Calculates the resolver fee.
     * @param fee Scaled resolver fee.
     * @param orderMakingAmount Making amount from the order.
     * @param actualMakingAmount Making amount that was actually filled.
     * @return resolverFee Calculated resolver fee.
     */
    function _getResolverFee(
        uint256 fee,
        uint256 orderMakingAmount,
        uint256 actualMakingAmount
    ) internal pure virtual returns(uint256) {
        return fee * _ORDER_FEE_BASE_POINTS * actualMakingAmount / orderMakingAmount;
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
     * @return extraData The data remaining after parsing.
     */
    function _parseFeeData(
        bytes calldata data,
        uint256 orderMakingAmount,
        uint256 actualMakingAmount,
        uint256 actualTakingAmount
    ) internal pure virtual returns (uint256 resolverFee, address integrator, uint256 integrationFee, bytes calldata extraData) {
        bytes1 feeType = data[0];
        data = data[1:];
        if (feeType & 0x01 == 0x01) {
            // resolverFee enabled
            resolverFee = _getResolverFee(uint256(uint32(bytes4(data[:4]))), orderMakingAmount, actualMakingAmount);
            data = data[4:];
        }
        if (feeType & 0x02 == 0x02) {
            // integratorFee enabled
            integrator = address(bytes20(data[:20]));
            integrationFee = actualTakingAmount * uint256(uint32(bytes4(data[20:24]))) / _TAKING_FEE_BASE;
            data = data[24:];
        }
        extraData = data;
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
            bytes calldata whitelist
        ) = _parseFeeData(extraData, order.makingAmount, makingAmount, takingAmount);

        if (!_isWhitelisted(whitelist, taker)) revert ResolverIsNotWhitelisted();

        _chargeFee(taker, resolverFee);
        if (integrationFee > 0) {
            IERC20(order.takerAsset.get()).safeTransferFrom(taker, integrator, integrationFee);
        }
    }
}
