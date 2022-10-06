// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;
pragma abicoder v1;

interface IStaking {
    function balanceOf(address account) external view returns (uint256);
    function votingPowerOf(address account) external view returns (uint256);
}
