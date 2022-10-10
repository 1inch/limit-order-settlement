// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;
pragma abicoder v1;

import "../../contracts/WhitelistRegistry.sol";

contract WhitelistRegistryMock is WhitelistRegistry {
    // solhint-disable-next-line no-empty-blocks
    constructor(IRewardableToken rewardToken_, VotingPowerCalculator st1inch_, uint256 threshold) WhitelistRegistry(rewardToken_, st1inch_, threshold) {}

    function votingPowerOf(uint256 balance) public pure override returns (uint256) {
        return balance / 2;
    }
}
