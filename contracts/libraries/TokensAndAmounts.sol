// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import "@1inch/solidity-utils/contracts/libraries/AddressLib.sol";

/// @title Library to parse TokensAndAmounts array from calldata
library TokensAndAmounts {
    struct Data {
        Address token;
        uint256 amount;
    }

    /**
     * @notice Decodes calldata passed to settlement function and returns an array of structs representing token addresses and amounts.
     * @param cd Calldata passed to settlement function.
     * @return decoded Array of structs representing token addresses and amounts.
     */
    function decode(bytes calldata cd) internal pure returns(Data[] calldata decoded) {
        assembly ("memory-safe") {
            decoded.offset := cd.offset
            decoded.length := div(cd.length, 0x40)
        }
    }
}
