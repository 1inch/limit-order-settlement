// SPDX-License-Identifier: MIT

pragma solidity 0.8.23;

import { IOrderMixin } from "@1inch/limit-order-protocol-contract/contracts/interfaces/IOrderMixin.sol";
import { FeeTaker } from "@1inch/limit-order-protocol-contract/contracts/extensions/FeeTaker.sol";
import { CustomInteractionExtension } from "./CustomInteractionExtension.sol";
import "hardhat/console.sol";

/**
 * @title Integrator and Resolver Fees Extension
 * @notice Abstract contract designed to integrate fee processing within the post-interaction phase of order execution.
 */
contract FeeExtension is CustomInteractionExtension, FeeTaker {
    constructor(address limitOrderProtocol, address weth, address owner) FeeTaker(limitOrderProtocol, weth, owner) {}

    /**
     * @dev See {_parseFeeData}, except `1 byte - resolver whitelist size` includes a flag in the most significant bit indicating the receiver of taking tokens.
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
    ) internal virtual override(CustomInteractionExtension, FeeTaker) {
        console.log("FeeExtension._postInteraction");
        uint256 usefulExtraDataLength = 29;
        if (uint8(extraData[8]) & 0x80 > 0) {
            usefulExtraDataLength += 20; // receiver of taking tokens
        }
        usefulExtraDataLength += 12 * (uint8(extraData[8]) & 0x7F); // & 0x7F - remove receiver of taking tokens flag

        FeeTaker._postInteraction(order, extension, orderHash, taker, makingAmount, takingAmount, remainingMakingAmount, extraData);
        console.logBytes(extraData[usefulExtraDataLength:]);
        CustomInteractionExtension._postInteraction(order, extension, orderHash, taker, makingAmount, takingAmount, remainingMakingAmount, extraData[usefulExtraDataLength:]);
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
    function _isWhitelisted(uint256 allowedTime, bytes calldata whitelist, uint256 whitelistSize, address resolver) internal view returns (bool) {
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
     * @dev Calldata parsing for fee data and whitelist check.
     * `extraData` consists of:
     * 2 bytes — integrator fee percentage (in 1e5)
     * 2 bytes — resolver fee percentage (in 1e5)
     * 4 bytes - the time after which interaction with the order is allowed.
     * 1 byte - resolver whitelist size includes a flag in the most significant bit indicating the receiver of taking tokens
     * (bytes10,bytes2)[N] — whitelist with resolver addresses and time deltas
     * 20 bytes — fee recipient
     * 20 bytes — receiver of taking tokens (optional, if not set, maker is used)
     */
    function _parseFeeData(bytes calldata extraData, address taker) internal view override returns (uint256 integratorFee, uint256 resolverFee, bytes calldata tail) {
        unchecked {
            integratorFee = uint256(uint16(bytes2(extraData)));
            resolverFee = uint256(uint16(bytes2(extraData[2:])));
            uint256 allowedTime = uint32(bytes4(extraData[4:]));
            uint256 resolversCount = uint256(uint8(extraData[8]) & 0x7F); // & 0x7F - remove receiver of taking tokens flag
            uint256 whitelistSize = resolversCount * 12;
            bytes calldata whitelist = extraData[9:9 + whitelistSize];
            if (!_isWhitelisted(allowedTime, whitelist, whitelistSize, taker)) {
                resolverFee *= 2;
            }
            tail = extraData[9 + whitelistSize:];
        }
    }
}
