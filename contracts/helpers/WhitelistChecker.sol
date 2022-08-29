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

    modifier onlyWhitelistedEOA(address account) {
        _verifiedAccount(account);
        _;
    }

    modifier onlyWhitelisted(address account) {
        if (account == _limitOrderProtocol) {
            if (_requiredChecksSuccessed) {
                _;
            } else {
                revert AccessDenied();
            }
        } else {
            _verifiedAccount(account);
            _requiredChecksSuccessed = true;
            _;
            _requiredChecksSuccessed = false;
        }
    }

    modifier onlyLimitOrderProtocol() {
        if (msg.sender != _limitOrderProtocol) revert AccessDenied();
        _;
    }

    function _verifiedAccount(address account) private view {
        if (_whitelist.status(account) != uint256(IWhitelistRegistry.Status.Verified)) revert AccessDenied();
    }
}
