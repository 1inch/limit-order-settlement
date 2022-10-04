// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import "../interfaces/IWhitelistRegistry.sol";

/// @title Contract with modifier for check does address in whitelist
contract WhitelistChecker {
    error AccessDenied();

    IWhitelistRegistry private immutable _whitelist;
    address private _limitOrderProtocol;
    address private _checked;

    constructor(IWhitelistRegistry whitelist, address limitOrderProtocol) {
        _whitelist = whitelist;
        _limitOrderProtocol = limitOrderProtocol;
    }

    modifier onlyWhitelistedEOA() {
        _enforceWhitelist(tx.origin); // solhint-disable-line avoid-tx-origin
        _;
    }

    modifier onlyWhitelisted(address account) {
        _enforceWhitelist(account);
        if (_checked == address(0)) {
            _checked = account;
            _;
            _checked = address(0);
        } else {
            _;
        }
    }

    function _onlyLimitOrderProtocol() internal view returns (address) {
        if (msg.sender != _limitOrderProtocol) revert AccessDenied(); // solhint-disable-next-line avoid-tx-origin
        if (_checked == address(0) && !_whitelist.isWhitelisted(tx.origin)) revert AccessDenied();
        return _checked != address(0) ? _checked : tx.origin; // solhint-disable-line avoid-tx-origin
    }

    function _enforceWhitelist(address account) private view {
        if (!_whitelist.isWhitelisted(account)) revert AccessDenied();
    }
}
