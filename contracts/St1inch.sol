// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@1inch/farming/contracts/ERC20Farmable.sol";
import "@1inch/delegating/contracts/ERC20Delegatable.sol";
import "@1inch/solidity-utils/contracts/libraries/SafeERC20.sol";
import "./helpers/VotingPowerCalculator.sol";

contract St1inch is ERC20Farmable, ERC20Delegatable, VotingPowerCalculator {
    using SafeERC20 for IERC20;

    error ZeroAddress();
    error BurnAmountExceedsBalance();
    error ApproveDisabled();
    error TransferDisabled();
    error TransferFromDisabled();
    error LockTimeMoreMaxLock();
    error LockTimeLessMinLock();
    error ChangeAmountAndUnlockTimeForExistingAccount();
    error UnlockTimeWasNotCome();

    uint256 public constant MIN_LOCK_PERIOD = 1 days;
    uint256 public constant MAX_LOCK_PERIOD = 4 * 365 days;

    IERC20 public immutable oneInch;
    mapping(address => uint256) private _unlockTime;
    mapping(address => uint256) private _deposits;

    uint256 public totalDeposits;

    constructor(
        IERC20 _oneInch,
        uint256 _expBase,
        uint256 maxUserFarms,
        uint256 maxUserDelegations
    ) ERC20Farmable(maxUserFarms) ERC20Delegatable(maxUserDelegations) ERC20("Staking 1inch", "st1inch") VotingPowerCalculator(_expBase, block.timestamp) { // solhint-disable-line not-rely-on-time
        oneInch = _oneInch;
    }

    function depositsAmount(address account) external view returns (uint256) {
        return _deposits[account];
    }

    function unlockTime(address account) external view returns (uint256) {
        return _unlockTime[account];
    }

    function votingPowerOf(address account) external view returns (uint256) {
        return votingPowerOf(balanceOf(account));
    }

    function votingPowerOf(address account, uint256 timestamp) external view returns (uint256) {
        return votingPowerOf(balanceOf(account), timestamp);
    }

    function approve(
        address, /* spender */
        uint256 /* amount */
    ) public pure override(IERC20, ERC20) returns (bool) {
        revert ApproveDisabled();
    }

    function transfer(
        address, /* to */
        uint256 /* amount */
    ) public pure override(IERC20, ERC20) returns (bool) {
        revert TransferDisabled();
    }

    function transferFrom(
        address, /* from */
        address, /* to */
        uint256 /* amount */
    ) public pure override(IERC20, ERC20) returns (bool) {
        revert TransferFromDisabled();
    }

    function deposit(uint256 amount, uint256 duration) external {
        _deposit(msg.sender, amount, duration);
    }

    function depositWithPermit(
        uint256 amount,
        uint256 duration,
        bytes calldata permit
    ) external {
        depositForWithPermit(msg.sender, amount, duration, permit);
    }

    function depositFor(
        address account,
        uint256 amount,
        uint256 duration
    ) external {
        _deposit(account, amount, duration);
    }

    function depositForWithPermit(
        address account,
        uint256 amount,
        uint256 duration,
        bytes calldata permit
    ) public {
        oneInch.safePermit(permit);
        _deposit(account, amount, duration);
    }

    function increaseLockDuration(uint256 duration) external {
        _deposit(msg.sender, 0, duration);
    }

    function increaseAmount(uint256 amount) external {
        _deposit(msg.sender, amount, 0);
    }

    /* solhint-disable not-rely-on-time */
    function _deposit(
        address account,
        uint256 amount,
        uint256 duration
    ) private {
        if (_deposits[account] > 0 && amount > 0 && duration > 0) revert ChangeAmountAndUnlockTimeForExistingAccount();

        if (amount > 0) {
            oneInch.transferFrom(msg.sender, address(this), amount);
            _deposits[account] += amount;
            totalDeposits += amount;
        }

        uint256 balance = _deposits[account];

        uint256 lockedTill = Math.max(_unlockTime[account], block.timestamp) + duration;
        if (lockedTill < block.timestamp + MIN_LOCK_PERIOD) revert LockTimeLessMinLock();
        if (lockedTill > block.timestamp + MAX_LOCK_PERIOD) revert LockTimeMoreMaxLock();
        _unlockTime[account] = lockedTill;

        _mint(account, _invExp(balance, lockedTill - origin) - balanceOf(account));
    }

    /* solhint-enable not-rely-on-time */

    function withdraw() external {
        withdrawTo(msg.sender);
    }

    function withdrawTo(address to) public {
        // solhint-disable-next-line not-rely-on-time
        if (block.timestamp < _unlockTime[msg.sender]) revert UnlockTimeWasNotCome();

        uint256 balance = _deposits[msg.sender];
        totalDeposits -= balance;
        _deposits[msg.sender] = 0;
        _burn(msg.sender, balanceOf(msg.sender));

        oneInch.transfer(to, balance);
    }

    // ERC20 overrides
    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal virtual override(ERC20Farmable, ERC20Delegatable) {
        super._beforeTokenTransfer(from, to, amount);
    }
}
