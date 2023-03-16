// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import "@1inch/solidity-utils/contracts/libraries/AddressLib.sol";

// Layout of dynamic suffix is as follows:
// 0x00: resolver
// 0x20: resolverFee
// 0x80 ... -0x20: tokensAndAmounts bytes
// -0x20: tokensAndAmounts length in bytes
library DynamicSuffix {
    struct Data {
        Address resolver;
        uint256 resolverFee;
    }

    uint256 internal constant _STATIC_DATA_SIZE = 0x40;

    function decodeSuffix(bytes calldata cd) internal pure returns(Data calldata suffix, bytes calldata tokensAndAmounts, bytes calldata args) {
        assembly {
            let lengthOffset := sub(add(cd.offset, cd.length), 0x20)
            tokensAndAmounts.length := calldataload(lengthOffset)
            tokensAndAmounts.offset := sub(lengthOffset, tokensAndAmounts.length)

            suffix := sub(tokensAndAmounts.offset, _STATIC_DATA_SIZE)
            args.offset := add(cd.offset, 1)
            args.length := sub(suffix, args.offset)
        }
    }
}
