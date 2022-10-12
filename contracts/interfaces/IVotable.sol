// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;
pragma abicoder v1;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IVotable is IERC20 {
    function votingPowerOf(address account) external view returns (uint256);
}
