// SPDX-License-Identifier: MIT

pragma solidity 0.8.15;

import "@1inch/delegating/contracts/delegations/DelegateeToken.sol";
import "@1inch/farming/contracts/ERC20Farmable.sol";

contract SolvingDelegationToken is DelegateeToken, ERC20Farmable {
    error MethodDisabled();

    constructor(
        string memory name,
        string memory symbol,
        uint256 maxUserFarms
    ) DelegateeToken(name, symbol) ERC20Farmable(maxUserFarms) {} // solhint-disable-line no-empty-blocks

    function transfer(
        address, /* to */
        uint256 /* amount */
    ) public pure override(IERC20, ERC20) returns (bool) {
        revert MethodDisabled();
    }

    function approve(
        address, /* spender */
        uint256 /* amount */
    ) public pure override(IERC20, ERC20) returns (bool) {
        revert MethodDisabled();
    }

    function transferFrom(
        address, /* from */
        address, /* to */
        uint256 /* amount */
    ) public pure override(IERC20, ERC20) returns (bool) {
        revert MethodDisabled();
    }

    // ERC20 overrides
    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal virtual override(ERC20Farmable, ERC20) {
        super._beforeTokenTransfer(from, to, amount);
    }
}
