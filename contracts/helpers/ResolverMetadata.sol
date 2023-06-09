// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import "@1inch/delegating/contracts/interfaces/ITokenizedDelegationPod.sol";

/// @notice Stores resolvers link to their metadata, which is displayed in 1inch dapp.
contract ResolverMetadata {

    /// @dev Emitted when an unregistered resolver tries to perform a restricted operation.
    error NotRegisteredDelegatee();

    ITokenizedDelegationPod public immutable delegation;
    mapping (address => string) public getUrl;

    /// @dev Modifier to check if the sender is a registered resolver.
    modifier onlyRegistered {
        if (address(delegation.registration(msg.sender)) == address(0)) revert NotRegisteredDelegatee();
        _;
    }

    constructor(ITokenizedDelegationPod delegation_) {
        delegation = delegation_;
    }

    /**
     * @notice Sets the resolver's URL pointing to the metadata.
     * @dev Only resolver registered for delegation can call this function.
     * @param url The resolver URL to be set for the resolver.
     */
    function setResolverUrl(string calldata url) external onlyRegistered {
        getUrl[msg.sender] = url;
    }
}
