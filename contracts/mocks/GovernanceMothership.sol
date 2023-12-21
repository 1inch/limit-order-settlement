// SPDX-License-Identifier: MIT

pragma solidity 0.8.23;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract GovernanceMothership is ERC20 {
    error EmptyStake();
    error EmptyUnstake();

    IERC20 public inchToken;

    constructor (IERC20 inchToken_) ERC20("1INCH Token (Staked)", "st1INCH") {
        inchToken = inchToken_;
    }

    function stake(uint256 amount) external {
        if (amount == 0) revert EmptyStake();

        inchToken.transferFrom(msg.sender, address(this), amount);
        _mint(msg.sender, amount);
        // _notifyFor(msg.sender, balanceOf(msg.sender));
        emit Transfer(address(0), msg.sender, amount);
    }

    function unstake(uint256 amount) external {
        if (amount == 0) revert EmptyUnstake();

        _burn(msg.sender, amount);
        // _notifyFor(msg.sender, balanceOf(msg.sender));
        inchToken.transfer(msg.sender, amount);
        emit Transfer(msg.sender, address(0), amount);
    }
}
