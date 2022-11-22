// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@1inch/erc20-pods/contracts/ERC20Pods.sol";
import "@1inch/solidity-utils/contracts/libraries/SafeERC20.sol";
import "./helpers/VotingPowerCalculator.sol";
import "./interfaces/IVotable.sol";

contract St1inch is ERC20Pods, Ownable, VotingPowerCalculator, IVotable {
    using SafeERC20 for IERC20;

    error ApproveDisabled();
    error TransferDisabled();
    error LockTimeMoreMaxLock();
    error LockTimeLessMinLock();
    error ChangeAmountAndUnlockTimeForExistingAccount();
    error UnlockTimeHasNotCome();

    uint256 public constant MIN_LOCK_PERIOD = 1 days;
    uint256 public constant MAX_LOCK_PERIOD = 4 * 365 days;
    uint256 private constant _VOTING_POWER_DIVIDER = 10;

    IERC20 public immutable oneInch;

    mapping(address => uint256) private _unlockTime;
    mapping(address => uint256) private _deposits;

    uint256 public totalDeposits;
    bool public emergencyExit;
    uint256 public immutable expBase;
    // solhint-disable-next-line not-rely-on-time
    uint256 public immutable origin = block.timestamp;

    constructor(
        IERC20 _oneInch,
        uint256 _expBase,
        uint256 podsLimit
    )
        ERC20Pods(podsLimit)
        ERC20("Staking 1inch", "st1inch")
        VotingPowerCalculator(_expBase, origin)
    {
        oneInch = _oneInch;
        expBase = _expBase;
    }

    function setEmergencyExit(bool _emergencyExit) external onlyOwner {
        emergencyExit = _emergencyExit;
    }

    function depositsAmount(address account) external view returns (uint256) {
        return _deposits[account];
    }

    function unlockTime(address account) external view returns (uint256) {
        return _unlockTime[account];
    }

    function votingPowerOf(address account) external view returns (uint256) {
        // solhint-disable-next-line not-rely-on-time
        return _votingPowerAt(balanceOf(account), block.timestamp);
    }

    function votingPowerOfAt(address account, uint256 timestamp) external view returns (uint256) {
        return _votingPowerAt(balanceOf(account), timestamp);
    }

    function votingPower(uint256 balance) external view returns (uint256) {
        // solhint-disable-next-line not-rely-on-time
        return _votingPowerAt(balance, block.timestamp);
    }

    function votingPowerAt(uint256 balance, uint256 timestamp) external view returns (uint256) {
        return _votingPowerAt(balance, timestamp);
    }

    function deposit(uint256 amount, uint256 duration) external {
        _deposit(msg.sender, amount, duration);
    }

    function depositWithPermit(
        uint256 amount,
        uint256 duration,
        bytes calldata permit
    ) external {
        oneInch.safePermit(permit);
        _deposit(msg.sender, amount, duration);
    }

    function depositFor(
        address account,
        uint256 amount
    ) external {
        _deposit(account, amount, 0);
    }

    function depositForWithPermit(
        address account,
        uint256 amount,
        bytes calldata permit
    ) external {
        oneInch.safePermit(permit);
        _deposit(account, amount, 0);
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
            oneInch.safeTransferFrom(msg.sender, address(this), amount);
            _deposits[account] += amount;
            totalDeposits += amount;
        }

        uint256 lockedTill = Math.max(_unlockTime[account], block.timestamp) + duration;
        uint256 lockedPeriod = lockedTill - block.timestamp;
        if (lockedPeriod < MIN_LOCK_PERIOD) revert LockTimeLessMinLock();
        if (lockedPeriod > MAX_LOCK_PERIOD) revert LockTimeMoreMaxLock();
        _unlockTime[account] = lockedTill;

        _mint(account, _balanceAt(_deposits[account], lockedTill) / _VOTING_POWER_DIVIDER - balanceOf(account));
    }

    /* solhint-enable not-rely-on-time */

    function withdraw() external {
        withdrawTo(msg.sender);
    }

    function withdrawTo(address to) public {
        // solhint-disable-next-line not-rely-on-time
        if (!emergencyExit && block.timestamp < _unlockTime[msg.sender]) revert UnlockTimeHasNotCome();

        uint256 balance = _deposits[msg.sender];
        totalDeposits -= balance;
        _deposits[msg.sender] = 0;
        _burn(msg.sender, balanceOf(msg.sender));

        oneInch.safeTransfer(to, balance);
    }

    // ERC20 methods disablers

    function approve(address, uint256) public pure override(IERC20, ERC20) returns (bool) {
        revert ApproveDisabled();
    }

    function transfer(address, uint256) public pure override(IERC20, ERC20) returns (bool) {
        revert TransferDisabled();
    }

    function transferFrom(address, address, uint256) public pure override(IERC20, ERC20) returns (bool) {
        revert TransferDisabled();
    }

    function increaseAllowance(address, uint256) public pure override returns (bool) {
        revert ApproveDisabled();
    }

    function decreaseAllowance(address, uint256) public pure override returns (bool) {
        revert ApproveDisabled();
    }
}
