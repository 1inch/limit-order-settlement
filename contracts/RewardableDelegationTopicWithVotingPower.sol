// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import "@1inch/delegating/contracts/delegations/RewardableDelegation.sol";
import "./helpers/VotingPowerCalculator.sol";
import "./interfaces/IVotable.sol";
import "./St1inch.sol";

contract RewardableDelegationTopicWithVotingPower is RewardableDelegation, VotingPowerCalculator, IVotable {
    constructor(string memory name_, string memory symbol_, St1inch st1inch)
        RewardableDelegation(name_, symbol_)
        VotingPowerCalculator(st1inch.expBase(), st1inch.origin())
    {} // solhint-disable-line no-empty-blocks

    function votingPowerOf(address account) external view virtual returns (uint256) {
        // solhint-disable-next-line not-rely-on-time
        return _votingPowerAt(balanceOf(account), block.timestamp);
    }
}
