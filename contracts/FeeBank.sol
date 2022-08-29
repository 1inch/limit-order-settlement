// SPDX-License-Identifier: MIT

pragma solidity 0.8.15;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@1inch/solidity-utils/contracts/libraries/SafeERC20.sol";
import "./interfaces/ISettlement.sol";

/// @title Contract with fee mechanism for solvers to pay for using the system
contract FeeBank {
    using SafeERC20 for IERC20;

    IERC20 private immutable _token;
    ISettlement private immutable _settlement;

    mapping(address => uint256) public accountDeposits;

    constructor(ISettlement settlement, IERC20 inch) {
        _settlement = settlement;
        _token = inch;
    }

    function deposit(uint256 amount) external returns(uint256) {
        return _depositFor(msg.sender, amount);
    }

    function depositFor(address account, uint256 amount) external returns(uint256) {
        return _depositFor(account, amount);
    }

    function depositWithPermit(uint256 amount, bytes calldata permit) external returns(uint256) {
        return depositForWithPermit(msg.sender, amount, permit);
    }

    function depositForWithPermit(address account, uint256 amount, bytes calldata permit) public returns(uint256) {
        _token.safePermit(permit);
        return _depositFor(account, amount);
    }

    function withdraw(uint256 amount) external returns(uint256) {
        return _withdrawTo(msg.sender, amount);
    }

    function withdrawTo(address account, uint256 amount) external returns(uint256) {
        return _withdrawTo(account, amount);
    }

    function _depositFor(address account, uint256 amount) internal returns(uint256 totalCreditAllowance) {
        _token.safeTransferFrom(msg.sender, address(this), amount);
        accountDeposits[account] += amount;
        totalCreditAllowance = _settlement.addCreditAllowance(account, amount);
    }

    function _withdrawTo(address account, uint256 amount) internal returns(uint256 totalCreditAllowance) {
        totalCreditAllowance = _settlement.subCreditAllowance(msg.sender, amount);
        accountDeposits[msg.sender] -= amount;
        _token.safeTransfer(account, amount);
    }
}
