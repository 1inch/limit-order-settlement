// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import "../interfaces/IWhitelistRegistry.sol";

/// @title Contract with modifier for check does address in whitelist
contract WhitelistChecker {
    error AccessDenied();

    address private constant _NOT_CHECKED = address(1);

    IWhitelistRegistry private immutable _whitelist;
    address private _limitOrderProtocol;
    address private _checked = _NOT_CHECKED;

    constructor(IWhitelistRegistry whitelist, address limitOrderProtocol) {
        _whitelist = whitelist;
        _limitOrderProtocol = limitOrderProtocol;
    }

    modifier onlyWhitelisted(address account) {
        if (!_whitelist.isWhitelisted(account)) revert AccessDenied();
        if (_checked == _NOT_CHECKED) {
            _checked = account;
            _;
            _checked = _NOT_CHECKED;
        } else {
            _;
        }
    }

    function _interactionAuth() internal view returns (address checked) {
        if (msg.sender != _limitOrderProtocol) revert AccessDenied();
        checked = _checked;
        if (checked == _NOT_CHECKED) revert AccessDenied();
    }
}
