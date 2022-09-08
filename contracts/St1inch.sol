// SPDX-License-Identifier: MIT

pragma solidity 0.8.15;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract St1inch is ERC20 {
    error ZeroAddress();
    error BurnAmountExceedsBalance();
    error ApproveDisabled();
    error AllowanceDisabled();
    error TransferDisabled();
    error TransferFromDisabled();
    error LockTimeMoreMaxLock();
    error LockTimeLessMinLock();
    error ChangeAmountAndUnlockTimeForExistingAccount();
    error UnlockTimeWasNotCome();

    uint256 public constant MIN_LOCK_PERIOD = 1 days;
    uint256 public constant MAX_LOCK_PERIOD = 4 * 365 days;

    IERC20 public immutable oneInch;
    uint256 public immutable origin;
    uint256 public immutable expBase;

    mapping(address => uint256) private _lockedTime;
    mapping(address => uint256) private _deposits;

    uint256 public totalDeposits;

    constructor(IERC20 _oneInch, uint256 _expBase) ERC20("Staking 1inch", "st1inch") {
        oneInch = _oneInch;
        expBase = _expBase;
        // solhint-disable-next-line not-rely-on-time
        origin = block.timestamp;
    }

    function depositsAmount(address account) external view returns (uint256) {
        return _deposits[account];
    }

    function votingPowerOf(address account) external view returns (uint256) {
        // solhint-disable-next-line not-rely-on-time
        return _exp(balanceOf(account), block.timestamp - origin);
    }

    function votingPowerOf(address account, uint256 timestamp) external view returns (uint256) {
        return _exp(balanceOf(account), timestamp - origin);
    }

    function transfer(address /* to */, uint256 /* amount */) public pure override returns (bool) {
        revert TransferDisabled();
    }

    function allowance(address /* owner */, address /* spender */) public pure override returns (uint256) {
        revert AllowanceDisabled();
    }

    function approve(address /* spender */, uint256 /* amount */) public pure override returns (bool) {
        revert ApproveDisabled();
    }

    function transferFrom(address /* from */, address /* to */, uint256 /* amount */) public pure override returns (bool) {
        revert TransferFromDisabled();
    }

    function deposit(uint256 amount, uint256 unlockTime) external {
        _deposit(msg.sender, amount, unlockTime);
    }

    function depositFor(address account, uint256 amount, uint256 unlockTime) external {
        _deposit(account, amount, unlockTime);
    }

    function increaseUnlockTime(uint256 unlockTime) external {
        _deposit(msg.sender, 0, unlockTime);
    }

    function increaseAmount(uint256 amount) external {
        _deposit(msg.sender, amount, 0);
    }

    function _deposit(address account, uint256 amount, uint256 duration) private {
        if (_deposits[account] > 0 && amount > 0 && duration > 0) revert ChangeAmountAndUnlockTimeForExistingAccount();

        if (amount > 0) {
            oneInch.transferFrom(msg.sender, address(this), amount);
            _deposits[account] += amount;
            totalDeposits += amount;
        }

        uint256 balance = _deposits[account];

        uint256 unlockTime = _lockedTime[account] + duration;
        // solhint-disable-next-line not-rely-on-time
        if (unlockTime < block.timestamp + MIN_LOCK_PERIOD) revert LockTimeLessMinLock();
        // solhint-disable-next-line not-rely-on-time
        if (unlockTime > block.timestamp + MAX_LOCK_PERIOD) revert LockTimeMoreMaxLock();

        _mint(account, _exp(balance, unlockTime - origin, 1e36 / expBase) - balanceOf(account));
    }

    function withdrawTo (address to) public {
        // solhint-disable-next-line not-rely-on-time
        if (_lockedTime[msg.sender] > block.timestamp) revert UnlockTimeWasNotCome();

        uint256 balance = _deposits[msg.sender];
        totalDeposits -= balance;
        _deposits[msg.sender] = 0;
        _burn(msg.sender, balanceOf(msg.sender));

        oneInch.transfer(to, balance);
    }

    function withdraw() external {
        withdrawTo(msg.sender);
    }

    function _exp(uint256 point, uint256 t) private view returns(uint256 exp) {
        return _exp(point, t, expBase);
    }

    function _exp(uint256 point, uint256 t, uint256 base) private pure returns(uint256) {
        unchecked {
            while(t > 0) {
                if((t & 0x01) == 1) {
                    point = point * base / 1e18;
                }
                base = base * base / 1e18;
                t >>= 1;
            }
        }
        return point;
    }
}