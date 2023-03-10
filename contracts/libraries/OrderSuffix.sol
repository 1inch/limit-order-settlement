// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import "@1inch/limit-order-protocol-contract/contracts/OrderLib.sol";

// Placed in the end of the order interactions data
// Last byte contains flags and lengths, can have up to 15 resolvers and 7 points
library OrderPrefix {
    // Order `interaction` prefix structure:
    // 1 bytes          - flags
    // 4 bytes          - order time start
    // 3 bytes          - order duration
    // 3 bytes          - initial rate bump
    // 4 bytes          - resolver fee
    // 4 bytes          - public time limit
    // N*(4 + 10 bytes) - resolver with corresponding time delay from order time start
    // M*(2 + 3 bytes)  - auction points coefficients with seconds delays from order time start
    // 24 bytes         - taking fee (optional if flags has _HAS_TAKING_FEE_FLAG)

    uint256 private constant _HAS_TAKING_FEE_FLAG = 0x80;
    uint256 private constant _RESOLVERS_LENGTH_MASK = 0x78;
    uint256 private constant _RESOLVERS_LENGTH_BIT_SHIFT = 3;
    uint256 private constant _POINTS_LENGTH_MASK = 0x07;

    uint256 private constant _TAKING_FEE_BYTES_SIZE = 24;
    uint256 private constant _TAKING_FEE_BIT_SHIFT = 64; // 256 - _TAKING_FEE_BYTES_SIZE * 8

    uint256 private constant _ORDER_TIME_START_BYTES_OFFSET = 1;
    uint256 private constant _ORDER_TIME_START_BIT_SHIFT = 224; // 256 - _ORDER_TIME_START_BYTES_SIZE * 8

    uint256 private constant _ORDER_DURATION_BYTES_OFFSET = 5; // _ORDER_TIME_START_BYTES_OFFSET + _ORDER_TIME_START_BYTES_SIZE
    uint256 private constant _ORDER_DURATION_BIT_SHIFT = 232; // 256 - _ORDER_DURATION_BYTES_SIZE * 8

    uint256 private constant _INITIAL_RATE_BUMP_BYTES_OFFSET = 8; // _ORDER_DURATION_BYTES_OFFSET + _ORDER_DURATION_BYTES_SIZE
    uint256 private constant _INITIAL_RATE_BUMP_BIT_SHIFT = 232; // 256 - _INITIAL_RATE_BUMP_BYTES_SIZE * 8

    uint256 private constant _RESOLVER_FEE_BYTES_OFFSET = 11; // _INITIAL_RATE_BUMP_BYTES_OFFSET + _INITIAL_RATE_BUMP_BYTES_SIZE
    uint256 private constant _RESOLVER_FEE_BIT_SHIFT = 224; // 256 - _RESOLVER_FEE_BYTES_SIZE * 8

    uint256 private constant _PUBLIC_TIME_LIMIT_BYTES_OFFSET = 15; // _RESOLVER_FEE_BYTES_OFFSET + _RESOLVER_FEE_BYTES_SIZE
    uint256 private constant _PUBLIC_TIME_LIMIT_BIT_SHIFT = 224; // 256 - _PUBLIC_TIME_LIMIT_BYTES_SIZE * 8

    uint256 private constant _RESOLVERS_LIST_BYTES_OFFSET = 19; // _PUBLIC_TIME_LIMIT_BYTES_OFFSET + _PUBLIC_TIME_LIMIT_BYTES_SIZE

    uint256 private constant _AUCTION_POINT_DELAY_BYTES_SIZE = 2;
    uint256 private constant _AUCTION_POINT_BUMP_BYTES_SIZE = 3;
    uint256 private constant _AUCTION_POINT_BYTES_SIZE = 5; // _AUCTION_POINT_DELAY_BYTES_SIZE + _AUCTION_POINT_BUMP_BYTES_SIZE;
    uint256 private constant _AUCTION_POINT_DELAY_BIT_SHIFT = 240; // 256 - _AUCTION_POINT_DELAY_BYTES_SIZE * 8;
    uint256 private constant _AUCTION_POINT_BUMP_BIT_SHIFT = 232; // 256 - _AUCTION_POINT_BUMP_BYTES_SIZE * 8;

    uint256 private constant _RESOLVER_TIME_LIMIT_BYTES_SIZE = 4;
    uint256 private constant _RESOLVER_ADDRESS_BYTES_SIZE = 10;
    uint256 private constant _RESOLVER_ADDRESS_MASK = 0xffffffffffffffffffff;
    uint256 private constant _RESOLVER_BYTES_SIZE = 14; // _RESOLVER_TIME_LIMIT_BYTES_SIZE + _RESOLVER_ADDRESS_BYTES_SIZE;
    uint256 private constant _RESOLVER_TIME_LIMIT_BIT_SHIFT = 224; // 256 - _RESOLVER_TIME_LIMIT_BYTES_SIZE * 8;
    uint256 private constant _RESOLVER_ADDRESS_BIT_SHIFT = 176; // 256 - _RESOLVER_ADDRESS_BYTES_SIZE * 8;

    function takingFee(bytes calldata interaction) internal pure returns (Address ret) {
        assembly ("memory-safe") {
            if and(_HAS_TAKING_FEE_FLAG, byte(0, calldataload(interaction.offset))) {
                let ptr := sub(add(interaction.offset, interaction.length), _TAKING_FEE_BYTES_SIZE)
                ret := shr(_TAKING_FEE_BIT_SHIFT, calldataload(ptr))
            }
        }
    }

    function checkResolver(bytes calldata interaction, address resolver) internal view returns (bool valid) {
        assembly ("memory-safe") {
            let flags := byte(0, calldataload(interaction.offset))
            let resolversCount := shr(_RESOLVERS_LENGTH_BIT_SHIFT, and(flags, _RESOLVERS_LENGTH_MASK))

            // Check public time limit
            let publicLimit := shr(_PUBLIC_TIME_LIMIT_BIT_SHIFT, calldataload(add(interaction.offset, _PUBLIC_TIME_LIMIT_BYTES_OFFSET)))
            valid := gt(timestamp(), publicLimit)

            // Check resolvers and corresponding time limits
            if iszero(valid) {
                let ptr := add(interaction.offset, _RESOLVERS_LIST_BYTES_OFFSET)
                for { let end := add(ptr, mul(_RESOLVER_BYTES_SIZE, resolversCount)) } lt(ptr, end) { } {
                    let limit := shr(_RESOLVER_TIME_LIMIT_BIT_SHIFT, calldataload(ptr))
                    ptr := add(ptr, _RESOLVER_TIME_LIMIT_BYTES_SIZE)
                    let account := shr(_RESOLVER_ADDRESS_BIT_SHIFT, calldataload(ptr))
                    ptr := add(ptr, _RESOLVER_ADDRESS_BYTES_SIZE)
                    if eq(account, and(resolver, _RESOLVER_ADDRESS_MASK)) {
                        valid := gt(timestamp(), limit)
                        break
                    }
                }
            }
        }
    }

    function rateBump(bytes calldata interaction) internal view returns (uint256 bump) {
        uint256 startBump;//  = uint256(bytes32((interaction[_INITIAL_RATE_BUMP_BYTES_OFFSET:]))) >> _INITIAL_RATE_BUMP_BIT_SHIFT;
        uint256 cumulativeTime; // = salt.getStartTime();
        uint256 lastTime; // = cumulativeTime + salt.getDuration();

        assembly {
            startBump := shr(_INITIAL_RATE_BUMP_BIT_SHIFT, calldataload(add(interaction.offset, _INITIAL_RATE_BUMP_BYTES_OFFSET)))
            cumulativeTime := shr(_ORDER_TIME_START_BIT_SHIFT, calldataload(add(interaction.offset, _ORDER_TIME_START_BYTES_OFFSET)))
            lastTime := add(cumulativeTime, shr(_ORDER_DURATION_BIT_SHIFT, calldataload(add(interaction.offset, _ORDER_DURATION_BYTES_OFFSET))))
        }

        if (block.timestamp <= cumulativeTime) {
            return startBump;
        } else if (block.timestamp >= lastTime) {
            return 0;
        }

        assembly {
            function linearInterpolation(t1, t2, v1, v2, t) -> v {
                v := div(
                    add(mul(sub(t, t1), v2), mul(sub(t2, t), v1)),
                    sub(t2, t1)
                )
            }

            // move ptr to the first point
            let ptr := add(interaction.offset, _RESOLVERS_LIST_BYTES_OFFSET)
            let pointsCount
            {
                let flags := byte(0, calldataload(ptr))
                let resolversCount := shr(_RESOLVERS_LENGTH_BIT_SHIFT, and(flags, _RESOLVERS_LENGTH_MASK))
                ptr := add(ptr, mul(resolversCount, _RESOLVER_BYTES_SIZE))
                pointsCount := and(flags, _POINTS_LENGTH_MASK)

            }

            // Check points sequentially
            let prevCoefficient := startBump
            let prevCumulativeTime := cumulativeTime
            for { let end := add(ptr, mul(_AUCTION_POINT_BYTES_SIZE, pointsCount)) } lt(ptr, end) { } {
                let delay := shr(_AUCTION_POINT_DELAY_BIT_SHIFT, calldataload(ptr))
                ptr := add(ptr, _AUCTION_POINT_DELAY_BYTES_SIZE)
                let coefficient := shr(_AUCTION_POINT_BUMP_BIT_SHIFT, calldataload(ptr))
                ptr := add(ptr, _AUCTION_POINT_BUMP_BYTES_SIZE)
                cumulativeTime := add(cumulativeTime, delay)
                if gt(cumulativeTime, timestamp()) {
                    // prevCumulativeTime <passed> time <elapsed> cumulativeTime
                    // prevCoefficient    <passed>  X   <elapsed> coefficient
                    bump := linearInterpolation(
                        prevCumulativeTime,
                        cumulativeTime,
                        prevCoefficient,
                        coefficient,
                        timestamp()
                    )
                    break
                }
                prevCumulativeTime := cumulativeTime
                prevCoefficient := coefficient
            }

            if iszero(bump) {
                bump := linearInterpolation(
                    prevCumulativeTime,
                    lastTime,
                    prevCoefficient,
                    0,
                    timestamp()
                )
            }
        }
    }

    function resolverFee() internal pure returns (uint256 fee) {
        assembly {
            fee := shr(_RESOLVER_FEE_BIT_SHIFT, calldataload(_RESOLVER_FEE_BYTES_OFFSET))
        }
    }
}
