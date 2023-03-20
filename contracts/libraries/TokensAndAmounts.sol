// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import "@1inch/solidity-utils/contracts/libraries/AddressLib.sol";

library TokensAndAmounts {
    struct Data {
        Address token;
        uint256 amount;
    }

    function decode(bytes calldata cd) internal pure returns(Data[] calldata decoded) {
        assembly ("memory-safe") {
            decoded.offset := cd.offset
            decoded.length := div(cd.length, 0x40)
        }
    }
}
