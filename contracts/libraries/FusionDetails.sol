// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import "@1inch/solidity-utils/contracts/libraries/AddressLib.sol";

/// @title Library to parse FusionDetails from calldata
/// @dev Placed in the end of the order interactions data
/// Last byte contains flags and lengths, can have up to 15 resolvers and 7 points
/// Fusion order `interaction` prefix structure:
/// struct Data {
///     bytes1 flags;
///     bytes4 startTime;
///     bytes2 auctionDelay;
///     bytes3 auctionDuration;
///     bytes3 initialRateBump;
///     bytes4 resolverFee;
///     bytes2 publicTimeDelay;
///     (bytes1,bytes2)[N] resolversIndicesAndTimeDeltas;
///     (bytes3,bytes2)[M] pointsAndTimeDeltas;
///     bytes24? takingFeeData; optional, present only if flags has _HAS_TAKING_FEE_FLAG
/// }
library FusionDetails {
    uint256 private constant _HAS_TAKING_FEE_FLAG = 0x80;
    uint256 private constant _TAKING_FEE_FLAG_BIT_SHIFT = 7;
    uint256 private constant _RESOLVERS_LENGTH_MASK = 0x78;
    uint256 private constant _RESOLVERS_LENGTH_BIT_SHIFT = 3;
    uint256 private constant _POINTS_LENGTH_MASK = 0x07;

    uint256 private constant _TAKING_FEE_DATA_BYTES_SIZE = 24;
    uint256 private constant _TAKING_FEE_DATA_BIT_SHIFT = 64; // 256 - _TAKING_FEE_DATA_BYTES_SIZE * 8

    uint256 private constant _START_TIME_BYTES_OFFSET = 1;
    // uint256 private constant _ORDER_TIME_START_BYTES_SIZE = 4;
    uint256 private constant _START_TIME_BIT_SHIFT = 224; // 256 - _ORDER_TIME_START_BYTES_SIZE * 8

    uint256 private constant _AUCTION_DELAY_BYTES_OFFSET = 5;
    // uint256 private constant _ORDER_TIME_START_BYTES_SIZE = 2;
    uint256 private constant _AUCTION_DELAY_BIT_SHIFT = 240; // 256 - _AUCTION_DELAY_BYTES_SIZE * 8

    uint256 private constant _AUCTION_DURATION_BYTES_OFFSET = 7; // _AUCTION_DELAY_BYTES_OFFSET + _AUCTION_DELAY_BYTES_SIZE
    // uint256 private constant _ORDER_DURATION_BYTES_SIZE = 3;
    uint256 private constant _AUCTION_DURATION_BIT_SHIFT = 232; // 256 - _ORDER_DURATION_BYTES_SIZE * 8

    uint256 private constant _INITIAL_RATE_BUMP_BYTES_OFFSET = 10; // _AUCTION_DURATION_BYTES_OFFSET + _ORDER_DURATION_BYTES_SIZE
    // uint256 private constant _INITIAL_RATE_BUMP_BYTES_SIZE = 3;
    uint256 private constant _INITIAL_RATE_BUMP_BIT_SHIFT = 232; // 256 - _INITIAL_RATE_BUMP_BYTES_SIZE * 8

    uint256 private constant _RESOLVER_FEE_BYTES_OFFSET = 13; // _INITIAL_RATE_BUMP_BYTES_OFFSET + _INITIAL_RATE_BUMP_BYTES_SIZE
    // uint256 private constant _RESOLVER_FEE_BYTES_SIZE = 4;
    uint256 private constant _RESOLVER_FEE_BIT_SHIFT = 224; // 256 - _RESOLVER_FEE_BYTES_SIZE * 8

    uint256 private constant _PUBLIC_TIME_DELAY_BYTES_OFFSET = 17; // _RESOLVER_FEE_BYTES_OFFSET + _RESOLVER_FEE_BYTES_SIZE
    // uint256 private constant _PUBLIC_TIME_DELAY_BYTES_SIZE = 2;
    uint256 private constant _PUBLIC_TIME_DELAY_BIT_SHIFT = 240; // 256 - _PUBLIC_TIME_DELAY_BYTES_SIZE * 8

    uint256 private constant _RESOLVERS_LIST_BYTES_OFFSET = 19; // _PUBLIC_TIME_DELAY_BYTES_OFFSET + _PUBLIC_TIME_DELAY_BYTES_SIZE

    uint256 private constant _AUCTION_POINT_BUMP_BYTES_SIZE = 3;
    uint256 private constant _AUCTION_POINT_DELTA_BYTES_SIZE = 2;
    uint256 private constant _AUCTION_POINT_BYTES_SIZE = 5; // _AUCTION_POINT_BUMP_BYTES_SIZE + _AUCTION_POINT_DELTA_BYTES_SIZE;
    uint256 private constant _AUCTION_POINT_BUMP_BIT_SHIFT = 232; // 256 - _AUCTION_POINT_BUMP_BYTES_SIZE * 8;
    uint256 private constant _AUCTION_POINT_DELTA_BIT_SHIFT = 240; // 256 - _AUCTION_POINT_DELTA_BYTES_SIZE * 8;

    uint256 private constant _RESOLVER_INDEX_BYTES_SIZE = 1;
    uint256 private constant _RESOLVER_DELTA_BYTES_SIZE = 2;
    uint256 private constant _RESOLVER_ADDRESS_BYTES_SIZE = 10;
    uint256 private constant _RESOLVER_ADDRESS_MASK = 0xffffffffffffffffffff;
    uint256 private constant _RESOLVER_BYTES_SIZE = 3; // _RESOLVER_DELTA_BYTES_SIZE + _RESOLVER_INDEX_BYTES_SIZE;
    uint256 private constant _RESOLVER_DELTA_BIT_SHIFT = 240; // 256 - _RESOLVER_DELTA_BYTES_SIZE * 8;
    uint256 private constant _RESOLVER_ADDRESS_BIT_SHIFT = 176; // 256 - _RESOLVER_ADDRESS_BYTES_SIZE * 8;

    /**
     * @notice Calculates fusion details calldata length passed to settlement function.
     * @param details Fusion details.
     * @return len Fusion details calldata length.
     */
    function detailsLength(bytes calldata details) internal pure returns (uint256 len) {
        if (details.length == 0) {
            return 0;
        }

        assembly ("memory-safe") {
            let flags := byte(0, calldataload(details.offset))
            let resolversCount := shr(_RESOLVERS_LENGTH_BIT_SHIFT, and(flags, _RESOLVERS_LENGTH_MASK))
            let pointsCount := and(flags, _POINTS_LENGTH_MASK)
            // length = resolver list offset + (resolvers count * resolversSize + points count * point size + taking fee flag * taking fee size)
            len := add(
                _RESOLVERS_LIST_BYTES_OFFSET,
                add(
                    add(
                        mul(resolversCount, _RESOLVER_BYTES_SIZE),
                        mul(pointsCount, _AUCTION_POINT_BYTES_SIZE)
                    ),
                    mul(_TAKING_FEE_DATA_BYTES_SIZE, shr(_TAKING_FEE_FLAG_BIT_SHIFT, flags))
                )
            )
        }
    }

    /**
     * @notice Decodes fusion details calldata and returns an array of structs representing token addresses and amounts.
     * @dev The structure of taking fee (24 bytes) is:
     * bytes4  taking fee
     * bytes20 taking fee recipient
     * @param details Fusion details calldata.
     * @return data Returns taking fee and taking fee recipient address, or `address(0)` if there is no fee.
     */
    function takingFeeData(bytes calldata details) internal pure returns (Address data) {
        assembly ("memory-safe") {
            if and(_HAS_TAKING_FEE_FLAG, byte(0, calldataload(details.offset))) {
                let ptr := sub(add(details.offset, details.length), _TAKING_FEE_DATA_BYTES_SIZE) // offset + length - taking fee data size
                data := shr(_TAKING_FEE_DATA_BIT_SHIFT, calldataload(ptr))
            }
        }
    }

    /**
     * @notice Computes a Keccak-256 hash over the fusion details data. 
     * The computation is done by reconstructing the data and hashing it.
     * The reconstruction involves:
     * - The first part of the fusion details data up to the resolvers list
     * - For each resolver, its associated data combined with a resolver address from the interaction data
     * - The rest of the details data including the auction points and optionally the taking fee and recipient
     * @dev The structure for keccak256 is:
     * bytes1 flags;
     * bytes4 startTime;
     * bytes2 auctionDelay;
     * bytes3 auctionDuration;
     * bytes3 initialRateBump;
     * bytes4 resolverFee;
     * bytes2 publicTimeDelay;
     * (bytes20,bytes2)[N] resolverAddress, resolverDelta;
     * (bytes3,bytes2) [M] pointsAndTimeDeltas;
     * bytes24? takingFeeData; only present if flags has _HAS_TAKING_FEE_FLAG
     * @param details The fusion details calldata
     * @param interaction The interaction calldata containing the resolver address
     * @return detailsHash The computed Keccak-256 hash over the reconstructed data
     */
    function computeHash(bytes calldata details, bytes calldata interaction) internal pure returns (bytes32 detailsHash) {
        assembly ("memory-safe") {
            let flags := byte(0, calldataload(details.offset))
            let resolversCount := shr(_RESOLVERS_LENGTH_BIT_SHIFT, and(flags, _RESOLVERS_LENGTH_MASK))
            let pointsCount := and(flags, _POINTS_LENGTH_MASK)
            // resolver callback address pointer
            let addressPtr := sub(add(interaction.offset, interaction.length), 1)
            // offset + length - 1 - resolver index * resolver address size
            addressPtr := sub(addressPtr, mul(_RESOLVER_ADDRESS_BYTES_SIZE, byte(0, calldataload(addressPtr))))

            let ptr := mload(0x40)
            let reconstructed := ptr
            calldatacopy(ptr, details.offset, _RESOLVERS_LIST_BYTES_OFFSET)
            ptr := add(ptr, _RESOLVERS_LIST_BYTES_OFFSET)

            let cdPtr := add(details.offset, _RESOLVERS_LIST_BYTES_OFFSET)
            // for each resolver
            for { let cdEnd := add(cdPtr, mul(_RESOLVER_BYTES_SIZE, resolversCount)) } lt(cdPtr, cdEnd) {} {
                let resolverIndex := byte(0, calldataload(cdPtr))
                cdPtr := add(cdPtr, _RESOLVER_INDEX_BYTES_SIZE)
                let deltaRaw := calldataload(cdPtr)
                cdPtr := add(cdPtr, _RESOLVER_DELTA_BYTES_SIZE)
                let resolverRaw := calldataload(add(addressPtr, mul(resolverIndex, _RESOLVER_ADDRESS_BYTES_SIZE)))

                mstore(ptr, resolverRaw)
                ptr := add(ptr, _RESOLVER_ADDRESS_BYTES_SIZE)
                mstore(ptr, deltaRaw)
                ptr := add(ptr, _RESOLVER_DELTA_BYTES_SIZE)
            }
            let takingFeeAndRecipientLength := mul(_TAKING_FEE_DATA_BYTES_SIZE, shr(_TAKING_FEE_FLAG_BIT_SHIFT, flags))
            let pointsAndtakingFeeInfoLength := add(mul(pointsCount, _AUCTION_POINT_BYTES_SIZE), takingFeeAndRecipientLength)
            calldatacopy(ptr, cdPtr, pointsAndtakingFeeInfoLength)
            ptr := add(ptr, pointsAndtakingFeeInfoLength)
            mstore(0x40, ptr)

            let len := sub(ptr, reconstructed)
            detailsHash := keccak256(reconstructed, len)
        }
    }

    function checkResolver(bytes calldata details, address resolver, bytes calldata interaction) internal view returns (bool valid) {
        assembly ("memory-safe") {
            let flags := byte(0, calldataload(details.offset))
            let resolversCount := shr(_RESOLVERS_LENGTH_BIT_SHIFT, and(flags, _RESOLVERS_LENGTH_MASK))

            // Check public time limit
            let startTime := shr(_START_TIME_BIT_SHIFT, calldataload(add(details.offset, _START_TIME_BYTES_OFFSET)))
            let publicTimeDelay := shr(_PUBLIC_TIME_DELAY_BIT_SHIFT, calldataload(add(details.offset, _PUBLIC_TIME_DELAY_BYTES_OFFSET)))
            valid := gt(timestamp(), add(startTime, publicTimeDelay))

            // Check resolvers and corresponding time limits
            if iszero(valid) {
                let resolverTimeStart := startTime
                let ptr := add(details.offset, _RESOLVERS_LIST_BYTES_OFFSET)
                let addressPtr := sub(add(interaction.offset, interaction.length), 1)
                addressPtr := sub(addressPtr, mul(_RESOLVER_ADDRESS_BYTES_SIZE, byte(0, calldataload(addressPtr))))
                for { let end := add(ptr, mul(_RESOLVER_BYTES_SIZE, resolversCount)) } lt(ptr, end) { } {
                    let resolverIndex := byte(0, calldataload(ptr))
                    ptr := add(ptr, _RESOLVER_INDEX_BYTES_SIZE)
                    resolverTimeStart := add(resolverTimeStart, shr(_RESOLVER_DELTA_BIT_SHIFT, calldataload(ptr)))
                    ptr := add(ptr, _RESOLVER_DELTA_BYTES_SIZE)

                    let account := shr(_RESOLVER_ADDRESS_BIT_SHIFT, calldataload(add(addressPtr, mul(resolverIndex, _RESOLVER_ADDRESS_BYTES_SIZE))))
                    if eq(account, and(resolver, _RESOLVER_ADDRESS_MASK)) {
                        valid := gt(timestamp(), resolverTimeStart)
                        break
                    }
                }
            }
        }
    }

    function rateBump(bytes calldata details) internal view returns (uint256 ret) {
        uint256 startBump;
        uint256 auctionStartTime;
        uint256 auctionFinishTime;
        assembly ("memory-safe") {
            startBump := shr(_INITIAL_RATE_BUMP_BIT_SHIFT, calldataload(add(details.offset, _INITIAL_RATE_BUMP_BYTES_OFFSET)))
            auctionStartTime := add(
                shr(_START_TIME_BIT_SHIFT, calldataload(add(details.offset, _START_TIME_BYTES_OFFSET))),
                shr(_AUCTION_DELAY_BIT_SHIFT, calldataload(add(details.offset, _AUCTION_DELAY_BYTES_OFFSET)))
            )
            auctionFinishTime := add(auctionStartTime, shr(_AUCTION_DURATION_BIT_SHIFT, calldataload(add(details.offset, _AUCTION_DURATION_BYTES_OFFSET))))
        }

        if (block.timestamp <= auctionStartTime) {
            return startBump;
        } else if (block.timestamp >= auctionFinishTime) {
            return 0; // Means 0% bump
        }

        assembly ("memory-safe") {
            function linearInterpolation(t1, t2, v1, v2, t) -> v {
                v := div(
                    add(mul(sub(t, t1), v2), mul(sub(t2, t), v1)),
                    sub(t2, t1)
                )
            }

            // move ptr to the first point
            let ptr := add(details.offset, _RESOLVERS_LIST_BYTES_OFFSET)
            let pointsCount
            {
                let flags := byte(0, calldataload(details.offset))
                let resolversCount := shr(_RESOLVERS_LENGTH_BIT_SHIFT, and(flags, _RESOLVERS_LENGTH_MASK))
                ptr := add(ptr, mul(resolversCount, _RESOLVER_BYTES_SIZE))
                pointsCount := and(flags, _POINTS_LENGTH_MASK)
            }

            // Check points sequentially
            let pointTime := auctionStartTime
            let prevBump := startBump
            let prevPointTime := pointTime
            for { let end := add(ptr, mul(_AUCTION_POINT_BYTES_SIZE, pointsCount)) } lt(ptr, end) { } {
                let bump := shr(_AUCTION_POINT_BUMP_BIT_SHIFT, calldataload(ptr))
                ptr := add(ptr, _AUCTION_POINT_BUMP_BYTES_SIZE)
                let delay := shr(_AUCTION_POINT_DELTA_BIT_SHIFT, calldataload(ptr))
                ptr := add(ptr, _AUCTION_POINT_DELTA_BYTES_SIZE)
                pointTime := add(pointTime, delay)
                if gt(pointTime, timestamp()) {
                    // Compute linear interpolation between prevBump and bump based on the time passed:
                    // prevPointTime <passed> now <elapsed> pointTime
                    // prevBump      <passed> ??? <elapsed> bump
                    ret := linearInterpolation(
                        prevPointTime,
                        pointTime,
                        prevBump,
                        bump,
                        timestamp()
                    )
                    break
                }
                prevPointTime := pointTime
                prevBump := bump
            }

            if iszero(ret) {
                ret := linearInterpolation(
                    prevPointTime,
                    auctionFinishTime,
                    prevBump,
                    0,
                    timestamp()
                )
            }
        }
    }

    /**
     * @notice Decodes fusion details calldata and returns the fee paid by a resolver for filling the order.
     * @param details Fusion details calldata.
     * @return fee Fee paid by a resolver for filling the order.
     */
    function resolverFee(bytes calldata details) internal pure returns (uint256 fee) {
        assembly ("memory-safe") {
            fee := shr(_RESOLVER_FEE_BIT_SHIFT, calldataload(add(details.offset, _RESOLVER_FEE_BYTES_OFFSET)))
        }
    }
}
