// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import "./Address.sol";

library DynamicSuffix {
    using AddressLib for Address;

    struct TokenAndAmount {
        Address token;
        uint256 amount;
    }

    struct Data {
        uint256 totalFee;
        Address resolver;
        Address receiver;
    }

    uint256 internal constant _DATA_SIZE = 0x60;
    uint256 internal constant _TAKING_FEE_BASE = 1e9;
    uint256 private constant _TAKING_FEE_FLAG = 1 << 255;
    uint256 private constant _TAKING_FEE_RATIO_OFFSET = 160;

    function takingFeeEnabled(Data calldata self) internal pure returns (bool) {
        return self.receiver.getFlag(_TAKING_FEE_FLAG);
    }

    function takingFeeRatio(Data calldata self) internal pure returns (uint256) {
        return self.receiver.getUint32(_TAKING_FEE_RATIO_OFFSET);
    }

    function makeFeeReceiver(uint32 feeRatio, address receiver) internal pure returns(Address) {
        return Address.wrap(_TAKING_FEE_FLAG | (uint256(feeRatio) << _TAKING_FEE_RATIO_OFFSET) | uint160(receiver));
    }
}
