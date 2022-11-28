// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;
pragma abicoder v1;

import "../RewardableDelegationPodWithVotingPower.sol";
import "../St1inch.sol";

contract RewardableDelegationPodWithVotingPowerMock is RewardableDelegationPodWithVotingPower {
    constructor(string memory name, string memory symbol, St1inch st1inch)
        RewardableDelegationPodWithVotingPower(name, symbol, st1inch)
    {}

    function mint(address account, uint256 amount) external {
        _mint(account, amount);
    }

    function burn(address account, uint256 amount) external {
        _burn(account, amount);
    }

    function votingPowerOf(address account) external view override returns (uint256) {
        return balanceOf(account) / 2;
    }
}
