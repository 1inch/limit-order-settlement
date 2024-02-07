// SPDX-License-Identifier: MIT

pragma solidity 0.8.23;

import { IOrderMixin } from "@1inch/limit-order-protocol-contract/contracts/interfaces/IOrderMixin.sol";
import { ExtensionBase } from "../ExtensionBase.sol";

abstract contract WhitelistExtension is ExtensionBase {
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
        bytes calldata extension,
        bytes32 orderHash,
        address taker,
        uint256 makingAmount,
        uint256 takingAmount,
        uint256 remainingMakingAmount,
        bytes calldata extraData
    ) internal virtual override {
        uint8 whitelistLength = uint8(extraData[0]);
        bytes calldata whitelist = extraData[1:1 + whitelistLength];
        if (!_isWhitelisted(whitelist, taker)) revert ResolverIsNotWhitelisted();
        super._postInteraction(order, extension, orderHash, taker, makingAmount, takingAmount, remainingMakingAmount, extraData[1 + whitelistLength:]);
    }
}
