// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import "@1inch/limit-order-protocol-contract/contracts/OrderLib.sol";
import "./OrderSaltParser.sol";
import "./TakingFee.sol";

// Placed in the end of the order interactions data
// Last byte contains flags and lengths, can have up to 15 resolvers and 7 points
library OrderSuffix {
    using OrderSaltParser for uint256;

    // `Order.interactions` suffix structure:
    // M*(1 + 2 bytes)  - auction points coefficients with seconds delays
    // N*(4 + 20 bytes) - resolver with corresponding time limit
    // 4 bytes          - public time limit
    // 32 bytes         - taking fee (optional if flags has _HAS_TAKING_FEE_FLAG)
    // 1 bytes          - flags

    uint256 private constant _HAS_TAKING_FEE_FLAG = 0x80;
    uint256 private constant _RESOLVERS_LENGTH_MASK = 0x78;
    uint256 private constant _RESOLVERS_LENGTH_OFFSET = 3;
    uint256 private constant _POINTS_LENGTH_MASK = 0x07;
    uint256 private constant _POINTS_LENGTH_OFFSET = 0;

    uint256 private constant _COEFFICIENT_BASE = 65536;

    function flags(OrderLib.Order calldata order) internal pure returns (uint256 ret) {
        bytes calldata interactions = order.interactions;
        assembly {
            let ptr := sub(add(interactions.offset, interactions.length), 1)
            ret := shr(248, calldataload(ptr))
        }
    }

    function takingFee(OrderLib.Order calldata order) internal pure returns (TakingFee.Data ret) {
        bytes calldata interactions = order.interactions;
        if (flags(order) & _HAS_TAKING_FEE_FLAG != 0) {
            assembly {
                let ptr := sub(add(interactions.offset, interactions.length), 33)
                ret := calldataload(ptr)
            }
        }
    }

    function checkResolver(OrderLib.Order calldata order, address resolver) internal view returns (bool valid) {
        bytes calldata interactions = order.interactions;
        uint256 flags_ = flags(order);
        uint256 resolversCount = (flags_ & _RESOLVERS_LENGTH_MASK) >> _RESOLVERS_LENGTH_OFFSET;
        assembly {
            let ptr := sub(add(interactions.offset, interactions.length), 1)
            if and(flags_, _HAS_TAKING_FEE_FLAG) {
                ptr := sub(ptr, 32)
            }

            // Check public time limit
            let publicLimit := shr(224, calldataload(ptr))
            ptr := sub(ptr, 4)
            valid := gt(timestamp(), publicLimit)

            // Check resolvers and corresponding time limits
            if not(valid) {
                for { let end := sub(ptr, mul(24, resolversCount)) } gt(ptr, end) { } {
                    ptr := sub(ptr, 20)
                    let account := shr(96, calldataload(ptr))
                    ptr := sub(ptr, 4)
                    let limit := shr(224, calldataload(ptr))
                    if eq(account, resolver) {
                        valid := lt(timestamp(), limit)
                        break
                    }
                }
            }
        }
    }

    // TODO: respect partial fills
    function pointBump(OrderLib.Order calldata order, uint256 startBump, uint256 time) internal pure returns (uint256 bump) {
        uint256 cumulativeTime = order.salt.getStartTime();
        uint256 lastTime = cumulativeTime + order.salt.getDuration();

        bytes calldata interactions = order.interactions;
        uint256 flags_ = flags(order);
        uint256 resolversCount = (flags_ & _RESOLVERS_LENGTH_MASK) >> _RESOLVERS_LENGTH_OFFSET;
        uint256 pointsCount = (flags_ & _POINTS_LENGTH_MASK) >> _POINTS_LENGTH_OFFSET;
        assembly {
            function linearInterpolation(t1, t2, v1, v2, t) -> v {
                v := div(
                    add(mul(sub(t, t1), v2), mul(sub(t2, t), v1)),
                    sub(t2, t1)
                )
            }

            // Fast backward to the first point
            let ptr := sub(add(interactions.offset, interactions.length), 5) // 1 byte for flags + 4 bytes for public time limit
            if and(flags_, _HAS_TAKING_FEE_FLAG) {
                ptr := sub(ptr, 32)
            }
            ptr := sub(ptr, mul(24, resolversCount))

            // Check points sequentially
            let prevCoefficient := startBump
            let prevCumulativeTime := cumulativeTime
            for { let end := sub(ptr, mul(3, pointsCount)) } gt(ptr, end) { } {
                ptr := sub(ptr, 2)
                let coefficient := shr(240, calldataload(ptr))
                ptr := sub(ptr, 1)
                let delay := shr(248, calldataload(ptr))
                if gt(cumulativeTime, time) {
                    // prevCumulativeTime <passed> time <elapsed> cumulativeTime
                    // prevCoefficient    <passed>  X   <elapsed> coefficient
                    bump := linearInterpolation(
                        prevCumulativeTime,
                        cumulativeTime,
                        prevCoefficient,
                        coefficient,
                        time
                    )
                    break
                }
                prevCumulativeTime := cumulativeTime
                prevCoefficient := coefficient
                cumulativeTime := add(cumulativeTime, delay)
            }

            if iszero(bump) {
                bump := linearInterpolation(
                    prevCumulativeTime,
                    lastTime,
                    prevCoefficient,
                    _COEFFICIENT_BASE,
                    time
                )
            }
        }
    }
}
