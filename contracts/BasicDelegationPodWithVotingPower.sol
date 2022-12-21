// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import "@1inch/delegating/contracts/BasicDelegationPod.sol";
import "./helpers/VotingPowerCalculator.sol";
import "./interfaces/IVotable.sol";
import "./St1inch.sol";

contract BasicDelegationPodWithVotingPower is BasicDelegationPod, VotingPowerCalculator, IVotable {
    constructor(string memory name_, string memory symbol_, St1inch st1inch)
        BasicDelegationPod(name_, symbol_, st1inch)
        VotingPowerCalculator(st1inch.expBase(), st1inch.origin())
    {}

    function votingPowerOf(address account) external view returns (uint256) {
        return _votingPowerAt(balanceOf(account), block.timestamp);
    }
}
