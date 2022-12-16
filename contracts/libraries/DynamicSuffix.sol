// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import "./Address.sol";
import "./TakingFee.sol";

library DynamicSuffix {
    struct Data {
        uint256 totalFee;
        Address resolver;
        Address token;
        uint256 salt;
        TakingFee.Data takingFee;
    }

    uint256 internal constant _DATA_SIZE = 0xa0;
}
