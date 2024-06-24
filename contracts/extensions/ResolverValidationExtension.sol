// SPDX-License-Identifier: MIT

pragma solidity 0.8.23;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IOrderMixin } from "@1inch/limit-order-protocol-contract/contracts/interfaces/IOrderMixin.sol";
import { FeeBankCharger } from "../FeeBankCharger.sol";
import { BaseExtension } from "./BaseExtension.sol";
import { ExtensionLib } from "./ExtensionLib.sol";

/**
 * @title Resolver Validation Extension
 * @notice This abstract contract combines functionalities to enhance security and compliance in the order execution process.
 * Ensures that only transactions from whitelisted resolvers or resolvers who own specific accessToken are processed within the post-interaction phase of order execution.
 * Additionally, it allows charging a fee to resolvers in the `postInteraction` method, providing a mechanism for resolver fee management.
 */
abstract contract ResolverValidationExtension is BaseExtension, FeeBankCharger {
    using ExtensionLib for bytes;

    error ResolverCanNotFillOrder();

    uint256 private constant _ORDER_FEE_BASE_POINTS = 1e15;
    /// @notice Contract address whose tokens allow filling limit orders with a fee for resolvers that are outside the whitelist
    IERC20 private immutable _ACCESS_TOKEN;

    constructor(IERC20 feeToken, IERC20 accessToken, address owner) FeeBankCharger(feeToken, owner) {
        _ACCESS_TOKEN = accessToken;
    }

    /**
     * @dev Validates whether the resolver is whitelisted.
     * @param allowedTime The time after which interaction with the order is allowed.
     * @param whitelist Whitelist is tightly packed struct of the following format:
     * ```
     * (bytes10,bytes2)[N] resolversAddressesAndTimeDeltas;
     * ```
     * Resolvers in the list are sorted in ascending order by the time when they are allowed to interact with the order.
     * Time deltas represent the time in seconds between the adjacent resolvers.
     * Only 10 lowest bytes of the resolver address are used for comparison.
     * @param whitelistSize The amount of resolvers in the whitelist.
     * @param resolver The resolver to check.
     * @return Whether the resolver is whitelisted.
     */
    function _isWhitelisted(uint256 allowedTime, bytes calldata whitelist, uint256 whitelistSize, address resolver) internal view virtual returns (bool) {
        unchecked {
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
     * @param extraData Structured data of length n bytes, segmented as follows:
     * [0:4] - Resolver fee information.
     * [4:8] - The time after which interaction with the order is allowed.
     * [8:k] - Data as defined by the `whitelist` parameter for the `_isWhitelisted` method,
     *         where k depends on the amount of resolvers in the whitelist, as indicated by the bitmap in the last byte.
     * [k:n] - ExtraData for other extensions, not utilized by this validation extension.
     * [n] - Bitmap indicating various usage flags and values.
     *       The bitmask xxxx xxx1 signifies resolver fee usage.
     *       The bitmask VVVV Vxxx represents the number of resolvers in the whitelist, where the V bits denote the count of resolvers.
     *       The remaining bits in this bitmap are not used by this extension.
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
        bool feeEnabled = extraData.resolverFeeEnabled();
        uint256 resolversCount = extraData.resolversCount();
        unchecked {
            uint256 resolverFee;
            if (feeEnabled) {
                resolverFee = _getResolverFee(uint256(uint32(bytes4(extraData[:4]))), order.makingAmount, makingAmount);
                extraData = extraData[4:];
            }

            uint256 allowedTime = uint32(bytes4(extraData[0:4]));
            extraData = extraData[4:];
            uint256 whitelistSize = resolversCount * 12;
            if (!_isWhitelisted(allowedTime, extraData[:whitelistSize], resolversCount, taker)) { // resolversCount always > 0 on prod
                if (allowedTime > block.timestamp || _ACCESS_TOKEN.balanceOf(taker) == 0) revert ResolverCanNotFillOrder();
                if (feeEnabled) {
                    _chargeFee(taker, resolverFee);
                }
            }
            super._postInteraction(order, extension, orderHash, taker, makingAmount, takingAmount, remainingMakingAmount, extraData[whitelistSize:]);
        }
    }
}
