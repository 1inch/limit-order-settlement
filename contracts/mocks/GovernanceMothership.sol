// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract GovernanceMothership is ERC20 {
    IERC20 public inchToken;

    constructor (IERC20 inchToken_) ERC20("1INCH Token (Staked)", "st1INCH") {
        inchToken = inchToken_;
    }

    function stake(uint256 amount) external {
        require(amount > 0, "Empty stake is not allowed");

        inchToken.transferFrom(msg.sender, address(this), amount);
        _mint(msg.sender, amount);
        // _notifyFor(msg.sender, balanceOf(msg.sender));
        emit Transfer(address(0), msg.sender, amount);
    }

    function unstake(uint256 amount) external {
        require(amount > 0, "Empty unstake is not allowed");

        _burn(msg.sender, amount);
        // _notifyFor(msg.sender, balanceOf(msg.sender));
        inchToken.transfer(msg.sender, amount);
        emit Transfer(msg.sender, address(0), amount);
    }
}
