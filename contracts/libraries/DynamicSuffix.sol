// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import "./Address.sol";
import "./TakingFee.sol";

library DynamicSuffix {
    struct Data {
        uint256 totalFee;
        Address resolver;
        Address token;
        uint256 rateBump;
        TakingFee.Data takingFee;
    }

    uint256 internal constant _DATA_SIZE = 0xa0;

    function decodeSuffix(bytes calldata cd) internal pure returns(Data calldata suffix) {
        assembly {
            suffix := sub(add(cd.offset, cd.length), _DATA_SIZE)
        }
    }
}
