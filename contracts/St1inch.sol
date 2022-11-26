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

    event EmergencyExitSet(bool status);

    error ApproveDisabled();
    error TransferDisabled();
    error LockTimeMoreMaxLock();
    error LockTimeLessMinLock();
    error UnlockTimeHasNotCome();

    uint256 public constant MIN_LOCK_PERIOD = 1 days;
    uint256 public constant MAX_LOCK_PERIOD = 4 * 365 days;
    uint256 private constant _VOTING_POWER_DIVIDER = 10;
    uint256 private constant _POD_CALL_GAS_LIMIT = 200_000;

    IERC20 public immutable oneInch;

    struct Depositor {
        uint40 unlockTime;
        uint216 amount;
    }

    mapping(address => Depositor) public depositors;

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
        ERC20Pods(podsLimit, _POD_CALL_GAS_LIMIT)
        ERC20("Staking 1inch", "st1inch")
        VotingPowerCalculator(_expBase, origin)
    {
        oneInch = _oneInch;
        expBase = _expBase;
    }

    function setEmergencyExit(bool _emergencyExit) external onlyOwner {
        emergencyExit = _emergencyExit;
        emit EmergencyExitSet(_emergencyExit);
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

    function previewBalance(address account, uint256 amount, uint256 lockedTill) public view returns (uint256) {
        return _previewBalance(depositors[account], amount, lockedTill);
    }

    function _previewBalance(Depositor memory depositor, uint256 amount, uint256 lockedTill) private view returns (uint256) {
        // solhint-disable-next-line not-rely-on-time
        uint256 lockLeft = lockedTill - block.timestamp;
        if (lockLeft < MIN_LOCK_PERIOD) revert LockTimeLessMinLock();
        if (lockLeft > MAX_LOCK_PERIOD) revert LockTimeMoreMaxLock();

        return _balanceAt(depositor.amount + amount, lockedTill) / _VOTING_POWER_DIVIDER;
    }

    function _deposit(address account, uint256 amount, uint256 duration) private {
        Depositor memory depositor = depositors[account]; // SLOAD

        // solhint-disable-next-line not-rely-on-time
        uint256 lockedTill = Math.max(depositor.unlockTime, block.timestamp) + duration;
        uint256 newBalance = _previewBalance(depositor, amount, lockedTill) - balanceOf(account);

        depositor.unlockTime = uint40(lockedTill);
        depositor.amount += uint216(amount);
        depositors[account] = depositor; // SSTORE
        totalDeposits += amount;
        _mint(account, newBalance);

        if (amount > 0) {
            oneInch.safeTransferFrom(msg.sender, address(this), amount);
        }
    }

    function withdraw() external {
        withdrawTo(msg.sender);
    }

    function withdrawTo(address to) public {
        Depositor memory depositor = depositors[msg.sender]; // SLOAD
        // solhint-disable-next-line not-rely-on-time
        if (!emergencyExit && block.timestamp < depositor.unlockTime) revert UnlockTimeHasNotCome();

        uint256 amount = depositor.amount;
        if (amount > 0) {
            totalDeposits -= amount;
            depositor.amount = 0; // Drain balance, but keep unlockTime in storage (NextTxGas optimization)
            depositors[msg.sender] = depositor; // SSTORE
            _burn(msg.sender, balanceOf(msg.sender));

            oneInch.safeTransfer(to, amount);
        }
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
