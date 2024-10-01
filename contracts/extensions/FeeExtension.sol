// SPDX-License-Identifier: MIT

pragma solidity 0.8.23;

import { IOrderMixin } from "@1inch/limit-order-protocol-contract/contracts/interfaces/IOrderMixin.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { FeeTaker } from "@1inch/limit-order-protocol-contract/contracts/extensions/FeeTaker.sol";

/**
 * @title Integrator and Resolver Fees Extension
 * @notice Abstract contract designed to integrate fee processing within the post-interaction phase of order execution.
 */
abstract contract FeeExtension is FeeTaker {
    uint256 private constant _BASE_POINTS = 10_000_000; // 100%
    uint256 private constant _GAS_PRICE_BASE = 1_000_000; // 1000 means 1 Gwei

    constructor(address limitOrderProtocol, address weth, address owner) FeeTaker(limitOrderProtocol, weth, owner) {}

    function _getCustomMakingAmount(
        IOrderMixin.Order calldata order,
        bytes calldata /* extension */,
        bytes32 /* orderHash */,
        address /* taker */,
        uint256 takingAmount,
        uint256 /* remainingMakingAmount */,
        bytes calldata extraData
    ) internal view override returns (uint256) {
        uint256 rateBump = _getRateBump(extraData);
        return Math.mulDiv(order.makingAmount, takingAmount * _BASE_POINTS, order.takingAmount * (_BASE_POINTS + rateBump));
    }

    function _getCustomTakingAmount(
        IOrderMixin.Order calldata order,
        bytes calldata /* extension */,
        bytes32 /* orderHash */,
        address /* taker */,
        uint256 makingAmount,
        uint256 /* remainingMakingAmount */,
        bytes calldata extraData
    ) internal view override returns (uint256) {
        uint256 rateBump = _getRateBump(extraData);
        return Math.mulDiv(order.takingAmount, makingAmount * (_BASE_POINTS + rateBump), order.makingAmount * _BASE_POINTS, Math.Rounding.Ceil);
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
    function _getRateBump(bytes calldata auctionDetails) private view returns (uint256) {
        unchecked {
            uint256 gasBumpEstimate = uint24(bytes3(auctionDetails[0:3]));
            uint256 gasPriceEstimate = uint32(bytes4(auctionDetails[3:7]));
            uint256 gasBump = gasBumpEstimate == 0 || gasPriceEstimate == 0 ? 0 : gasBumpEstimate * block.basefee / gasPriceEstimate / _GAS_PRICE_BASE;
            uint256 auctionStartTime = uint32(bytes4(auctionDetails[7:11]));
            uint256 auctionFinishTime = auctionStartTime + uint24(bytes3(auctionDetails[11:14]));
            uint256 initialRateBump = uint24(bytes3(auctionDetails[14:17]));
            uint256 auctionBump = _getAuctionBump(auctionStartTime, auctionFinishTime, initialRateBump, auctionDetails[17:]);
            return auctionBump > gasBump ? auctionBump - gasBump : 0;
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
    function _getAuctionBump(uint256 auctionStartTime, uint256 auctionFinishTime, uint256 initialRateBump, bytes calldata pointsAndTimeDeltas) private view returns (uint256) {
        unchecked {
            if (block.timestamp <= auctionStartTime) {
                return initialRateBump;
            } else if (block.timestamp >= auctionFinishTime) {
                return 0;
            }

            uint256 currentPointTime = auctionStartTime;
            uint256 currentRateBump = initialRateBump;

            while (pointsAndTimeDeltas.length > 0) {
                uint256 nextRateBump = uint24(bytes3(pointsAndTimeDeltas[:3]));
                uint256 nextPointTime = currentPointTime + uint16(bytes2(pointsAndTimeDeltas[3:5]));
                if (block.timestamp <= nextPointTime) {
                    return ((block.timestamp - currentPointTime) * nextRateBump + (nextPointTime - block.timestamp) * currentRateBump) / (nextPointTime - currentPointTime);
                }
                currentRateBump = nextRateBump;
                currentPointTime = nextPointTime;
                pointsAndTimeDeltas = pointsAndTimeDeltas[5:];
            }
            return (auctionFinishTime - block.timestamp) * currentRateBump / (auctionFinishTime - currentPointTime);
        }
    }

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
    ) internal virtual override {
        uint256 usefulExtraDataLength = 29;
        if (uint8(extraData[8]) & 0x80 > 0) {
            usefulExtraDataLength += 20; // receiver of taking tokens
        }
        usefulExtraDataLength += 12 * (uint8(extraData[8]) & 0x7F); // & 0x7F - remove receiver of taking tokens flag
        super._postInteraction(order, extension, orderHash, taker, makingAmount, takingAmount, remainingMakingAmount, extraData);
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
