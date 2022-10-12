// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;
pragma abicoder v1;

import "../../contracts/RewardableDelegationTopicWithVotingPower.sol";
import "../../contracts/St1inch.sol";

contract RewardableDelegationTopicWithVotingPowerMock is RewardableDelegationTopicWithVotingPower {
    constructor(string memory name, string memory symbol, St1inch st1inch)
        RewardableDelegationTopicWithVotingPower(name, symbol, st1inch)
    {} // solhint-disable-line no-empty-blocks

    function mint(address account, uint256 amount) external onlyOwner {
        _mint(account, amount);
    }

    function burn(address account, uint256 amount) external onlyOwner {
        _burn(account, amount);
    }

    function votingPowerOf(address account) external view override returns (uint256) {
        return balanceOf(account) / 2;
    }
}
