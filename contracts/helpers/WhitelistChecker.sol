// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import "../interfaces/IWhitelistRegistry.sol";

/// @title Contract with modifier for check does address in whitelist
contract WhitelistChecker {
    error AccessDenied();

    uint256 private constant _NOT_CHECKED = 1;
    uint256 private constant _CHECKED = 2;

    IWhitelistRegistry private immutable _whitelist;
    uint256 private _checked = _NOT_CHECKED;

    constructor(IWhitelistRegistry whitelist) {
        _whitelist = whitelist;
    }

    modifier onlyWhitelisted(address account) {
        if (!_whitelist.isWhitelisted(account)) revert AccessDenied();

        // TODO: check bytecode size when avoided doube _
        if (_checked == _NOT_CHECKED) {
            _checked = _CHECKED;
            _;
            _checked = _NOT_CHECKED;
        } else {
            _;
        }
    }
}
