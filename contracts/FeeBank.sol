// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@1inch/solidity-utils/contracts/libraries/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/ISettlement.sol";

/// @title Contract with fee mechanism for solvers to pay for using the system
contract FeeBank is Ownable {
    using SafeERC20 for IERC20;

    IERC20 private immutable _token;
    ISettlement private immutable _settlement;

    mapping(address => uint256) private _accountDeposits;

    constructor(ISettlement settlement, IERC20 inch) {
        _settlement = settlement;
        _token = inch;
    }

    function availableCredit(address account) external view returns (uint256) {
        return _settlement.creditAllowance(account);
    }

    /**
     * @notice Increment sender's creditAllowance in Settlement contract.
     * @param amount The amount of 1INCH sender pay for incresing.
     * @return totalCreditAllowance The total sender's creditAllowance after deposit.
     */
    function deposit(uint256 amount) external returns (uint256) {
        return _depositFor(msg.sender, amount);
    }

    /**
     * @notice Increases account's creditAllowance in Settlement contract.
     * @param account The account whose creditAllowance is increased by the sender.
     * @param amount The amount of 1INCH sender pay for incresing.
     * @return totalCreditAllowance The total account's creditAllowance after deposit.
     */
    function depositFor(address account, uint256 amount) external returns (uint256) {
        return _depositFor(account, amount);
    }

    /**
     * @notice See {deposit}. This method uses permit for deposit without prior approves.
     * @param amount The amount of 1INCH sender pay for incresing.
     * @param permit The data with sender's permission via token.
     * @return totalCreditAllowance The total sender's creditAllowance after deposit.
     */
    function depositWithPermit(uint256 amount, bytes calldata permit) external returns (uint256) {
        return depositForWithPermit(msg.sender, amount, permit);
    }

    /**
     * @notice See {depositFor} and {depositWithPermit}.
     */
    function depositForWithPermit(
        address account,
        uint256 amount,
        bytes calldata permit
    ) public returns (uint256) {
        _token.safePermit(permit);
        return _depositFor(account, amount);
    }

    /**
     * @notice Returns unspent creditAllowance.
     * @param amount The amount of 1INCH sender returns.
     * @return totalCreditAllowance The total sender's creditAllowance after withdrawal.
     */
    function withdraw(uint256 amount) external returns (uint256) {
        return _withdrawTo(msg.sender, amount);
    }

    /**
     * @notice Returns unspent creditAllowance to specific account.
     * @param account The account which get withdrawaled tokens.
     * @param amount The amount of withdrawaled tokens.
     * @return totalCreditAllowance The total sender's creditAllowance after withdrawal.
     */
    function withdrawTo(address account, uint256 amount) external returns (uint256) {
        return _withdrawTo(account, amount);
    }

    /**
     * @notice Admin method returns commissions spent by users.
     * @param accounts Accounts whose commissions are being withdrawn.
     * @return totalAccountFees The total amount of accounts commissions.
     */
    function gatherFees(address[] memory accounts) external onlyOwner returns (uint256 totalAccountFees) {
        uint256 accountsLength = accounts.length;
        for (uint256 i = 0; i < accountsLength; i++) {
            uint256 accountFee = _accountDeposits[accounts[i]] - _settlement.creditAllowance(accounts[i]);
            _accountDeposits[accounts[i]] -= accountFee;
            totalAccountFees += accountFee;
        }
        _token.safeTransfer(msg.sender, totalAccountFees);
    }

    function _depositFor(address account, uint256 amount) internal returns (uint256 totalCreditAllowance) {
        _token.safeTransferFrom(msg.sender, address(this), amount);
        _accountDeposits[account] += amount;
        totalCreditAllowance = _settlement.increaseCreditAllowance(account, amount);
    }

    function _withdrawTo(address account, uint256 amount) internal returns (uint256 totalCreditAllowance) {
        totalCreditAllowance = _settlement.decreaseCreditAllowance(msg.sender, amount);
        _accountDeposits[msg.sender] -= amount;
        _token.safeTransfer(account, amount);
    }
}
