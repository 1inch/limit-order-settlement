// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;
pragma abicoder v1;

import "../../contracts/RewardableDelegationTopicWithVotingPower.sol";

contract RewardableDelegationTopicWithVotingPowerMock is RewardableDelegationTopicWithVotingPower {
    // solhint-disable-next-line not-rely-on-time
    constructor(string memory name, string memory symbol) RewardableDelegationTopicWithVotingPower(name, symbol, 0, block.timestamp) {} // solhint-disable-line no-empty-blocks

    function mint(address account, uint256 amount) external onlyOwner {
        _mint(account, amount);
    }

    function burn(address account, uint256 amount) external onlyOwner {
        _burn(account, amount);
    }

    function votingPowerOf(address account) public view override returns (uint256) {
        return balanceOf(account) / 2;
    }
}
