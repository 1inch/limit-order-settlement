// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import "@1inch/solidity-utils/contracts/libraries/AddressLib.sol";

/// @title Library to parse DynamicSuffix from calldata
library DynamicSuffix {
    struct Data {
        Address resolver;
        uint256 resolverFee;
    }

    uint256 internal constant _STATIC_DATA_SIZE = 0x40;

    /**
     * @notice Decodes calldata passed to settlement function and returns suffix (resolver, resolverFee) and tokensAndAmounts array.
     * @dev Layout of dynamic suffix is:
     * 0x00     finalize interaction flag
     * 0x01     fusion details (variable length, N-1)
     * N + 0x00 resolver
     * N + 0x20 resolverFee
     * N + 0x40 tokensAndAmounts bytes (variable length, until `calldata length - 32 bytes`)
     * -0x20    tokensAndAmounts array length in bytes (the last 32 bytes of calldata)
     * @param cd Calldata passed to settlement function.
     * @return suffix Dynamic suffix (resolver, resolverFee).
     * resolverFee is the accumulated fee paid by the resolver for a sequence of fills.
     * @return tokensAndAmounts calldata containing tokensAndAmounts.
     * @return args calldata containing fusion details.
     */
    function decodeSuffix(bytes calldata cd) internal pure returns(Data calldata suffix, bytes calldata tokensAndAmounts, bytes calldata args) {
        assembly ("memory-safe") {
            let lengthOffset := sub(add(cd.offset, cd.length), 0x20)               // length is stored in the last 32 bytes of calldata
            tokensAndAmounts.length := calldataload(lengthOffset)                  // loads tokensAndAmounts array length in bytes
            tokensAndAmounts.offset := sub(lengthOffset, tokensAndAmounts.length)  // loads tokensAndAmounts array

            suffix := sub(tokensAndAmounts.offset, _STATIC_DATA_SIZE) // loads suffix (resolver, resolverFee) struct
            args.offset := add(cd.offset, 1)                          // loads fusion details calldata into args
            args.length := sub(suffix, args.offset)
        }
    }
}
