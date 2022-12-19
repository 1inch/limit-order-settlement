// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import "./Address.sol";

library TokensAndAmounts {
    struct Data {
        Address token;
        uint256 amount;
    }

    function decode(bytes calldata cd) internal pure returns(Data[] calldata decoded) {
        assembly {
            decoded.offset := cd.offset
            decoded.length := div(cd.length, 0x40)
        }
    }
}
