// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@1inch/erc20-pods/contracts/ERC20Pods.sol";
import "@1inch/erc20-pods/contracts/Pod.sol";
import "@1inch/solidity-utils/contracts/libraries/SafeERC20.sol";
import "./helpers/VotingPowerCalculator.sol";
import "./interfaces/IVotable.sol";

contract St1inch is ERC20Pods, Ownable, VotingPowerCalculator, IVotable {
    using SafeERC20 for IERC20;

    event EmergencyExitSet(bool status);
    event MaxLossRatioSet(uint256 ratio);
    event FeeReceiverSet(address receiver);
    event DefaultFarmSet(address defaultFarm);

    error ApproveDisabled();
    error TransferDisabled();
    error LockTimeMoreMaxLock();
    error LockTimeLessMinLock();
    error UnlockTimeHasNotCome();
    error StakeUnlocked();
    error MinReturnIsNotMet();
    error MaxLossIsNotMet();
    error MaxLossOverflow();
    error LossIsTooBig();
    error RescueAmountIsTooLarge();
    error DefaultFarmTokenMismatch();

    uint256 public constant MIN_LOCK_PERIOD = 30 days;
    uint256 public constant MAX_LOCK_PERIOD = 4 * 365 days;
    uint256 private constant _VOTING_POWER_DIVIDER = 10;
    uint256 private constant _POD_CALL_GAS_LIMIT = 200_000;
    uint256 private constant _ONE = 1e9;

    IERC20 public immutable oneInch;

    struct Depositor {
        uint40 unlockTime;
        uint216 amount;
    }

    mapping(address => Depositor) public depositors;

    uint256 public totalDeposits;
    bool public emergencyExit;
    uint256 public maxLossRatio;
    address public feeReceiver;
    address public defaultFarm;

    constructor(IERC20 oneInch_, uint256 expBase_, uint256 podsLimit)
        ERC20Pods(podsLimit, _POD_CALL_GAS_LIMIT)
        ERC20("Staking 1INCH", "st1INCH")
        VotingPowerCalculator(expBase_, block.timestamp)
    {
        oneInch = oneInch_;
    }

    function setFeeReceiver(address feeReceiver_) external onlyOwner {
        feeReceiver = feeReceiver_;
        emit FeeReceiverSet(feeReceiver_);
    }

    function setDefaultFarm(address defaultFarm_) external onlyOwner {
        if (defaultFarm_ != address(0) && Pod(defaultFarm_).token() != address(this)) revert DefaultFarmTokenMismatch();
        defaultFarm = defaultFarm_;
        emit DefaultFarmSet(defaultFarm_);
    }

    function setMaxLossRatio(uint256 maxLossRatio_) external onlyOwner {
        if (maxLossRatio_ > _ONE) revert MaxLossOverflow();
        maxLossRatio = maxLossRatio_;
        emit MaxLossRatioSet(maxLossRatio_);
    }

    function setEmergencyExit(bool _emergencyExit) external onlyOwner {
        emergencyExit = _emergencyExit;
        emit EmergencyExitSet(_emergencyExit);
    }

    function votingPowerOf(address account) external view returns (uint256) {
        return _votingPowerAt(balanceOf(account), block.timestamp);
    }

    function votingPowerOfAt(address account, uint256 timestamp) external view returns (uint256) {
        return _votingPowerAt(balanceOf(account), timestamp);
    }

    function votingPower(uint256 balance) external view returns (uint256) {
        return _votingPowerAt(balance, block.timestamp);
    }

    function votingPowerAt(uint256 balance, uint256 timestamp) external view returns (uint256) {
        return _votingPowerAt(balance, timestamp);
    }

    function deposit(uint256 amount, uint256 duration) external {
        _deposit(msg.sender, amount, duration);
    }

    function depositWithPermit(uint256 amount, uint256 duration, bytes calldata permit) external {
        oneInch.safePermit(permit);
        _deposit(msg.sender, amount, duration);
    }

    function depositFor(address account, uint256 amount) external {
        _deposit(account, amount, 0);
    }

    function depositForWithPermit(address account, uint256 amount, bytes calldata permit) external {
        oneInch.safePermit(permit);
        _deposit(account, amount, 0);
    }

    function _deposit(address account, uint256 amount, uint256 duration) private {
        Depositor memory depositor = depositors[account]; // SLOAD

        uint256 lockedTill = Math.max(depositor.unlockTime, block.timestamp) + duration;
        uint256 lockLeft = lockedTill - block.timestamp;
        if (lockLeft < MIN_LOCK_PERIOD) revert LockTimeLessMinLock();
        if (lockLeft > MAX_LOCK_PERIOD) revert LockTimeMoreMaxLock();
        uint256 balanceDiff = _balanceAt(depositor.amount + amount, lockedTill) / _VOTING_POWER_DIVIDER - balanceOf(account);

        depositor.unlockTime = uint40(lockedTill);
        depositor.amount += uint216(amount);
        depositors[account] = depositor; // SSTORE
        totalDeposits += amount;
        _mint(account, balanceDiff);

        if (amount > 0) {
            oneInch.safeTransferFrom(msg.sender, address(this), amount);
        }

        if (defaultFarm != address(0) && !hasPod(account, defaultFarm)) {
            _addPod(account, defaultFarm);
        }
    }

    // ret(balance) = (deposit - vp(balance)) / 0.9
    function earlyWithdrawTo(address to, uint256 minReturn, uint256 maxLoss) external {
        Depositor memory depositor = depositors[msg.sender]; // SLOAD
        if (emergencyExit || block.timestamp >= depositor.unlockTime) revert StakeUnlocked();
        uint256 amount = depositor.amount;
        if (amount > 0) {
            uint256 balance = balanceOf(msg.sender);
            (uint256 loss, uint256 ret) = _earlyWithdrawLoss(amount, balance);
            if (ret < minReturn) revert MinReturnIsNotMet();
            if (loss > maxLoss) revert MaxLossIsNotMet();
            if (loss > amount * maxLossRatio / _ONE) revert LossIsTooBig();

            _withdraw(depositor, amount, balance);
            oneInch.safeTransfer(to, ret);
            oneInch.safeTransfer(feeReceiver, loss);
        }
    }

    function earlyWithdrawLoss(address account) external view returns (uint256 loss, uint256 ret) {
        return _earlyWithdrawLoss(depositors[account].amount, balanceOf(account));
    }

    function _earlyWithdrawLoss(uint256 depAmount, uint256 stBalance) private view returns (uint256 loss, uint256 ret) {
        ret = (depAmount - _votingPowerAt(stBalance, block.timestamp)) * 10 / 9;
        loss = depAmount - ret;
    }

    function withdraw() external {
        withdrawTo(msg.sender);
    }

    function withdrawTo(address to) public {
        Depositor memory depositor = depositors[msg.sender]; // SLOAD
        if (!emergencyExit && block.timestamp < depositor.unlockTime) revert UnlockTimeHasNotCome();

        uint256 amount = depositor.amount;
        if (amount > 0) {
            _withdraw(depositor, amount, balanceOf(msg.sender));
            oneInch.safeTransfer(to, amount);
        }
    }

    function _withdraw(Depositor memory depositor, uint256 amount, uint256 balance) private {
        totalDeposits -= amount;
        depositor.amount = 0;
        // keep unlockTime in storage for next tx optimization
        depositor.unlockTime = uint40(Math.min(depositor.unlockTime, block.timestamp));
        depositors[msg.sender] = depositor; // SSTORE
        _burn(msg.sender, balance);
    }

    function rescueFunds(IERC20 token, uint256 amount) external onlyOwner {
        if (address(token) == address(0)) {
            Address.sendValue(payable(msg.sender), amount);
        } else {
            if (token == oneInch) {
                if (amount > oneInch.balanceOf(address(this)) - totalDeposits) revert RescueAmountIsTooLarge();
            }
            token.safeTransfer(msg.sender, amount);
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
