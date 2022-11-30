// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import "../RewardableDelegationPodWithVotingPower.sol";

contract ResolverMetadata {
    error NotRegisteredDelegatee();

    RewardableDelegationPodWithVotingPower public immutable delegation;
    mapping (address => string) private _urls;

    modifier onlyRegistered {
        if (address(delegation.registration(msg.sender)) == address(0)) revert NotRegisteredDelegatee();
        _;
    }

    constructor(RewardableDelegationPodWithVotingPower delegation_) {
        delegation = delegation_;
    }

    function setResolverUrl(string calldata url) external onlyRegistered {
        _urls[msg.sender] = url;
    }

    function getResolverUrl(address resolver) external view returns (string memory) {
        if (address(delegation.registration(resolver)) == address(0)) {
            return "";
        }

        return _urls[resolver];
    }
}
