// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import "@1inch/delegating/contracts/delegations/BasicDelegationTopic.sol";
import "./helpers/VotingPowerCalculator.sol";
import "./interfaces/IVotable.sol";
import "./St1inch.sol";

contract BasicDelegationTopicWithVotingPower is BasicDelegationTopic, VotingPowerCalculator, IVotable {
    constructor(string memory name_, string memory symbol_, St1inch st1inch)
        BasicDelegationTopic(name_, symbol_)
        VotingPowerCalculator(st1inch.expBase(), st1inch.origin())
    {} // solhint-disable-line no-empty-blocks

    function votingPowerOf(address account) external view returns (uint256) {
        // solhint-disable-next-line not-rely-on-time
        return _votingPowerAt(balanceOf(account), block.timestamp);
    }
}
