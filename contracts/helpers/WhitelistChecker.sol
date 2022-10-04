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

    function _onlyLimitOrderProtocol() internal view returns (address checked) {
        if (msg.sender != _limitOrderProtocol) revert AccessDenied(); // solhint-disable-line avoid-tx-origin
        checked = _checked;
        if (checked == address(0)) {
            checked = tx.origin; // solhint-disable-line avoid-tx-origin
            if (!_whitelist.isWhitelisted(checked)) revert AccessDenied();
        }
    }

    function _enforceWhitelist(address account) private view {
        if (!_whitelist.isWhitelisted(account)) revert AccessDenied();
    }
}
