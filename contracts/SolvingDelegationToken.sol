// SPDX-License-Identifier: MIT

pragma solidity 0.8.15;

import "@1inch/delegating/contracts/delegations/DelegateeToken.sol";

contract SolvingDelegationToken is DelegateeToken {
    error ApproveDisabled();
    error TransferDisabled();
    error TransferFromDisabled();

    // solhint-disable-next-line no-empty-blocks
    constructor(string memory name_, string memory symbol_) DelegateeToken(name_, symbol_) {}

    function transfer(
        address, /* to */
        uint256 /* amount */
    ) public pure override(IERC20, ERC20) returns (bool) {
        revert TransferDisabled();
    }

    function approve(
        address, /* spender */
        uint256 /* amount */
    ) public pure override(IERC20, ERC20) returns (bool) {
        revert ApproveDisabled();
    }

    function transferFrom(
        address, /* from */
        address, /* to */
        uint256 /* amount */
    ) public pure override(IERC20, ERC20) returns (bool) {
        revert TransferFromDisabled();
    }
}
