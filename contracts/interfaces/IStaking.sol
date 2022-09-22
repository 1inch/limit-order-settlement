// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;
pragma abicoder v1;

interface IStaking {
    function balanceOf(address addr) external view returns (uint256);
}
