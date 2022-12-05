// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

library DynamicSuffix {
    struct Data {
        uint256 totalFee;
        uint256 _resolver;
        uint256 _token;
        uint256 salt;
        uint256 _flagTakingFeeRatioAndReceiver;
    }

    uint256 internal constant _DATA_SIZE = 0xa0;
    uint256 internal constant _TAKING_FEE_BASE = 1e9;

    function resolver(Data calldata self) internal pure returns (address) {
        return address(uint160(self._resolver));
    }

    function token(Data calldata self) internal pure returns (IERC20) {
        return IERC20(address(uint160(self._token)));
    }

    function takingFeeEnabled(Data calldata self) internal pure returns (bool) {
        return self._flagTakingFeeRatioAndReceiver >> 255 == 1;
    }

    function takingFeeReceiver(Data calldata self) internal pure returns (address) {
        return address(uint160(self._flagTakingFeeRatioAndReceiver));
    }

    function takingFeeRatio(Data calldata self) internal pure returns (uint256) {
        return self._flagTakingFeeRatioAndReceiver >> 160;
    }
}
