// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import "@1inch/delegating/contracts/delegations/BasicDelegation.sol";
import "./helpers/VotingPowerCalculator.sol";

contract BaseDelegationTopicWithVotingPower is BasicDelegation, VotingPowerCalculator {
    constructor(
        string memory name_,
        string memory symbol_,
        uint256 expBase_,
        uint256 origin_
    ) BasicDelegation(name_, symbol_) VotingPowerCalculator(expBase_, origin_) {} // solhint-disable-line no-empty-blocks

    function balanceOf(address account) public view override(VotingPowerCalculator,ERC20,IERC20) returns (uint256) {
        return ERC20.balanceOf(account);
    }
}
