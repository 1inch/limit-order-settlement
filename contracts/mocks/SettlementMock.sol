// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "../Settlement.sol";

contract SettlementMock is Settlement {
    constructor(IWhitelistRegistry whitelist, address limitOrderProtocol, IERC20 token)
        Settlement(whitelist, limitOrderProtocol, token)
    {}  // solhint-disable-line no-empty-blocks

    function increaseAvailableCreditMock(address account, uint256 amount) external onlyOwner returns (uint256 allowance) {
        allowance = _creditAllowance[account];
        allowance += amount;
        _creditAllowance[account] = allowance;
    }

    function decreaseAvailableCreditMock(address account, uint256 amount) external onlyOwner returns (uint256 allowance) {
        allowance = _creditAllowance[account];
        allowance -= amount;
        _creditAllowance[account] = allowance;
    }
}
