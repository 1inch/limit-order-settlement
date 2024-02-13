// SPDX-License-Identifier: MIT

pragma solidity 0.8.23;

import { IOrderMixin } from "@1inch/limit-order-protocol-contract/contracts/interfaces/IOrderMixin.sol";
import { BaseExtension } from "./BaseExtension.sol";

/**
 * @title Whitelist Extension
 * @notice Abstract contract designed to check resolvers from orders in whitelist within the post-interaction phase of order execution.
 * Ensures that only transactions from whitelisted resolvers are processed, enhancing security and compliance.
 */
abstract contract WhitelistExtension is BaseExtension {
    error ResolverIsNotWhitelisted();

    /**
     * @dev Validates whether the resolver is whitelisted.
     * @param whitelist Whitelist is tighly packed struct of the following format:
     * ```
     * struct WhitelistDetails {
     *     bytes4 auctionStartTime;
     *     (bytes10,bytes2)[N] resolversAddressesAndTimeDeltas;
     * }
     * ```
     * @param whitelistSize The amount of resolvers in the whitelist.
     * @param resolver The resolver to check.
     * @return Whether the resolver is whitelisted.
     */
    function _isWhitelisted(bytes calldata whitelist, uint256 whitelistSize, address resolver) internal view virtual returns (bool) {
        unchecked {
            uint256 allowedTime = uint32(bytes4(whitelist[0:4])); // initially set to auction start time
            whitelist = whitelist[4:];
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
     * @param extraData Structured data of length n bytes, segmented as follows:
     * [0:k] - Data as defined by the `whitelist` parameter for the `_isWhitelisted` method,
     *         where k depends on the amount of resolvers in the whitelist, as indicated by the bitmap in the last byte.
     * [k:n] - ExtraData for other extensions, not utilized by this whitelist extension.
     * [n]   - Bitmap `VVVV Vxxx` where V bits represent the amount of resolvers in the whitelist. The remaining bits in this bitmap are not used by this extension.
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
        uint8 resolversLength = uint8(extraData[extraData.length - 1]) >> 3;
        uint256 whitelistLength = 4 + resolversLength * 12;
        bytes calldata whitelist = extraData[:whitelistLength];
        if (!_isWhitelisted(whitelist, resolversLength, taker)) revert ResolverIsNotWhitelisted();
        super._postInteraction(order, extension, orderHash, taker, makingAmount, takingAmount, remainingMakingAmount, extraData[whitelistLength:]);
    }
}
