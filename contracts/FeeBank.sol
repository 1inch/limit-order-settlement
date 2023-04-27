// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@1inch/solidity-utils/contracts/libraries/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IFeeBankCharger.sol";
import "./interfaces/IFeeBank.sol";

/// @title Contract with fee mechanism for solvers to pay for using the system
contract FeeBank is IFeeBank, Ownable {
    using SafeERC20 for IERC20;

    error ZeroAddress();

    IERC20 private immutable _token;
    IFeeBankCharger private immutable _charger;

    mapping(address => uint256) private _accountDeposits;

    constructor(IFeeBankCharger charger_, IERC20 inch_, address owner_) {
        if (address(inch_) == address(0)) revert ZeroAddress();
        _charger = charger_;
        _token = inch_;
        transferOwnership(owner_);
    }

    /**
     * @notice See {IFeeBank-availableCredit}.
     */
    function availableCredit(address account) external view returns (uint256) {
        return _charger.availableCredit(account);
    }

    /**
     * @notice See {IFeeBank-deposit}.
     */
    function deposit(uint256 amount) external returns (uint256) {
        return _depositFor(msg.sender, amount);
    }

    /**
     * @notice See {IFeeBank-depositFor}.
     */
    function depositFor(address account, uint256 amount) external returns (uint256) {
        return _depositFor(account, amount);
    }

    /**
     * @notice See {IFeeBank-depositWithPermit}.
     */
    function depositWithPermit(uint256 amount, bytes calldata permit) external returns (uint256) {
        return depositForWithPermit(msg.sender, amount, permit);
    }

    /**
     * @notice See {IFeeBank-depositForWithPermit}.
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
     * @notice See {IFeeBank-withdraw}.
     */
    function withdraw(uint256 amount) external returns (uint256) {
        return _withdrawTo(msg.sender, amount);
    }

    /**
     * @notice See {IFeeBank-withdrawTo}.
     */
    function withdrawTo(address account, uint256 amount) external returns (uint256) {
        return _withdrawTo(account, amount);
    }

    /**
     * @notice Admin method returns commissions spent by users.
     * @param accounts Accounts whose commissions are being withdrawn.
     * @return totalAccountFees The total amount of accounts commissions.
     */
    function gatherFees(address[] calldata accounts) external onlyOwner returns (uint256 totalAccountFees) {
        uint256 accountsLength = accounts.length;
        unchecked {
            for (uint256 i = 0; i < accountsLength; ++i) {
                address account = accounts[i];
                uint256 accountDeposit = _accountDeposits[account];
                uint256 availableCredit_ = _charger.availableCredit(account);
                _accountDeposits[account] = availableCredit_;
                totalAccountFees += accountDeposit - availableCredit_;  // overflow is impossible due to checks in FeeBankCharger
            }
        }
        _token.safeTransfer(msg.sender, totalAccountFees);
    }

    function _depositFor(address account, uint256 amount) internal returns (uint256 totalAvailableCredit) {
        if (account == address(0)) revert ZeroAddress();
        _token.safeTransferFrom(msg.sender, address(this), amount);
        unchecked {
            _accountDeposits[account] += amount;  // overflow is impossible due to limited _token supply
        }
        totalAvailableCredit = _charger.increaseAvailableCredit(account, amount);
    }

    function _withdrawTo(address account, uint256 amount) internal returns (uint256 totalAvailableCredit) {
        totalAvailableCredit = _charger.decreaseAvailableCredit(msg.sender, amount);
        unchecked {
            _accountDeposits[msg.sender] -= amount;  // underflow is impossible due to checks in FeeBankCharger
        }
        _token.safeTransfer(account, amount);
    }
}
