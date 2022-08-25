// SPDX-License-Identifier: MIT

pragma solidity 0.8.15;

import "../interfaces/IWhitelistRegistry.sol";

/// @title Contract with modifier for check does address in whitelist
contract WhitelistChecker {
    error AccessDenied();

    IWhitelistRegistry private immutable _whitelist;
    address private _limitOrderProtocol;
    bool private _requiredChecksSuccessed = false;

    constructor(IWhitelistRegistry whitelist, address limitOrderProtocol) {
        _whitelist = whitelist;
        _limitOrderProtocol = limitOrderProtocol;
    }

    modifier onlyWhitelisted(address account) {
        if (account == _limitOrderProtocol) {
            if (_requiredChecksSuccessed) {
                _;
            } else {
                revert AccessDenied();
            }
        } else {
            if (_whitelist.status(account) != uint256(IWhitelistRegistry.Status.Verified)) revert AccessDenied();
            _requiredChecksSuccessed = true;
            _;
            _requiredChecksSuccessed = false;
        }
    }
}
