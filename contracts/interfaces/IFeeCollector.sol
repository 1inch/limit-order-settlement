// SPDX-License-Identifier: MIT

pragma solidity 0.8.15;

interface IFeeCollector {
    function payFee(uint256 rate) external;
}