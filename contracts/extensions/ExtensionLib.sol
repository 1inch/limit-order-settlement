// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

library ExtensionLib {
    bytes1 private constant _RESOLVER_FEE_FLAG = 0x01;
    bytes1 private constant _INTEGRATOR_FEE_FLAG = 0x02;
    uint256 private constant _WHITELIST_SHIFT = 3;

    function resolverFeeEnabled(bytes calldata extraData) internal pure returns (bool) {
        return extraData[extraData.length - 1] & _RESOLVER_FEE_FLAG == _RESOLVER_FEE_FLAG;
    }

    function integratorFeeEnabled(bytes calldata extraData) internal pure returns (bool) {
        return extraData[extraData.length - 1] & _INTEGRATOR_FEE_FLAG == _INTEGRATOR_FEE_FLAG;
    }

    function whitelistCount(bytes calldata extraData) internal pure returns (uint256) {
        return uint8(extraData[extraData.length - 1]) >> _WHITELIST_SHIFT;
    }
}
