// SPDX-License-Identifier: MIT
import "hardhat/console.sol";

pragma solidity 0.8.15;

contract FeeCollector {
    function payFee(uint256 rate) external view {
        console.log("rate:", rate);
    }
}