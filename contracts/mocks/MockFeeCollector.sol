// SPDX-License-Identifier: MIT

pragma solidity 0.8.15;

contract MockFeeCollector {
    uint256[] public rates;

    function payFee(uint256 rate) external {
        rates.push(rate);
    }
}