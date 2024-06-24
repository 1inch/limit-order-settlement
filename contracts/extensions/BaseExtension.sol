// SPDX-License-Identifier: MIT

pragma solidity 0.8.23;

import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { IOrderMixin } from "@1inch/limit-order-protocol-contract/contracts/interfaces/IOrderMixin.sol";
import { IPostInteraction } from "@1inch/limit-order-protocol-contract/contracts/interfaces/IPostInteraction.sol";
import { IPreInteraction } from "@1inch/limit-order-protocol-contract/contracts/interfaces/IPreInteraction.sol";
import { IAmountGetter } from "@1inch/limit-order-protocol-contract/contracts/interfaces/IAmountGetter.sol";

/**
 * @title Base Extension contract
 * @notice Contract to define the basic functionality for the limit orders settlement.
 */
contract BaseExtension is IPreInteraction, IPostInteraction, IAmountGetter {
    error OnlyLimitOrderProtocol();

    uint256 private constant _BASE_POINTS = 10_000_000; // 100%
    uint256 private constant _GAS_PRICE_BASE = 1_000_000; // 1000 means 1 Gwei

    address private immutable _LIMIT_ORDER_PROTOCOL;

    /// @dev Modifier to check if the caller is the limit order protocol contract.
    modifier onlyLimitOrderProtocol {
        if (msg.sender != _LIMIT_ORDER_PROTOCOL) revert OnlyLimitOrderProtocol();
        _;
    }

    /**
     * @notice Initializes the contract.
     * @param limitOrderProtocol The limit order protocol contract.
     */
    constructor(address limitOrderProtocol) {
        _LIMIT_ORDER_PROTOCOL = limitOrderProtocol;
    }

    /**
     * See {IAmountGetter-getMakingAmount}
     */
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

    /**
     * See {IAmountGetter-getTakingAmount}
     */
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

    /**
     * See {IPreInteraction-preInteraction}
     */
    function preInteraction(
        IOrderMixin.Order calldata order,
        bytes calldata extension,
        bytes32 orderHash,
        address taker,
        uint256 makingAmount,
        uint256 takingAmount,
        uint256 remainingMakingAmount,
        bytes calldata extraData
    ) external onlyLimitOrderProtocol {
        _preInteraction(order, extension, orderHash, taker, makingAmount, takingAmount, remainingMakingAmount, extraData);
    }

    /**
     * See {IPostInteraction-postInteraction}
     */
    function postInteraction(
        IOrderMixin.Order calldata order,
        bytes calldata extension,
        bytes32 orderHash,
        address taker,
        uint256 makingAmount,
        uint256 takingAmount,
        uint256 remainingMakingAmount,
        bytes calldata extraData
    ) external onlyLimitOrderProtocol {
        _postInteraction(order, extension, orderHash, taker, makingAmount, takingAmount, remainingMakingAmount, extraData);
    }

    function _preInteraction(
        IOrderMixin.Order calldata order,
        bytes calldata extension,
        bytes32 orderHash,
        address taker,
        uint256 makingAmount,
        uint256 takingAmount,
        uint256 remainingMakingAmount,
        bytes calldata extraData
    ) internal virtual {}

    function _postInteraction(
        IOrderMixin.Order calldata order,
        bytes calldata extension,
        bytes32 orderHash,
        address taker,
        uint256 makingAmount,
        uint256 takingAmount,
        uint256 remainingMakingAmount,
        bytes calldata extraData
    ) internal virtual {
        // Allows to add custom postInteractions
        if (extraData.length > 20) {
            IPostInteraction(address(bytes20(extraData))).postInteraction(order, extension, orderHash, taker, makingAmount, takingAmount, remainingMakingAmount, extraData[20 : extraData.length - 1]);
        }
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
}
