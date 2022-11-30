// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import "../RewardableDelegationPodWithVotingPower.sol";

contract ResolverMetadata {
    error NotRegisteredDelegatee();

    RewardableDelegationPodWithVotingPower public immutable delegation;
    mapping (address => string) public getUrl;

    modifier onlyRegistered {
        if (address(delegation.registration(msg.sender)) == address(0)) revert NotRegisteredDelegatee();
        _;
    }

    constructor(RewardableDelegationPodWithVotingPower delegation_) {
        delegation = delegation_;
    }

    function setResolverUrl(string calldata url) external onlyRegistered {
        getUrl[msg.sender] = url;
    }
}
