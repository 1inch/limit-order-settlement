// SPDX-License-Identifier: MIT

pragma solidity 0.8.23;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./interfaces/IFeeBankCharger.sol";
import "./FeeBank.sol";

/**
 * @title FeeBankCharger
 * @notice FeeBankCharger contract implements logic to increase or decrease users' credits in FeeBank.
 */
contract FeeBankCharger is IFeeBankCharger {
    error OnlyFeeBankAccess();
    error NotEnoughCredit();

    /**
     * @notice See {IFeeBankCharger-feeBank}.
     */
    IFeeBank public immutable feeBank;
    mapping(address => uint256) private _creditAllowance;

    /**
     * @dev Modifier to check if the sender is a feeBank contract.
     */
    modifier onlyFeeBank() {
        if (msg.sender != address(feeBank)) revert OnlyFeeBankAccess();
        _;
    }

    constructor(IERC20 token) {
        feeBank = new FeeBank(this, token, msg.sender);
    }

    /**
     * @notice See {IFeeBankCharger-availableCredit}.
     */
    function availableCredit(address account) external view returns (uint256) {
        return _creditAllowance[account];
    }

    /**
     * @notice See {IFeeBankCharger-increaseAvailableCredit}.
     */
    function increaseAvailableCredit(address account, uint256 amount) external onlyFeeBank returns (uint256 allowance) {
        allowance = _creditAllowance[account];
        unchecked {
            allowance += amount;  // overflow is impossible due to limited _token supply
        }
        _creditAllowance[account] = allowance;
    }

    /**
     * @notice See {IFeeBankCharger-decreaseAvailableCredit}.
     */
    function decreaseAvailableCredit(address account, uint256 amount) external onlyFeeBank returns (uint256 allowance) {
        return _creditAllowance[account] -= amount;  // checked math is needed to prevent underflow
    }

    /**
     * @notice Internal function that charges a specified fee from a given account's credit allowance.
     * @dev Reverts with 'NotEnoughCredit' if the account's credit allowance is insufficient to cover the fee.
     * @param account The address of the account from which the fee is being charged.
     * @param fee The amount of fee to be charged from the account.
     */
    function _chargeFee(address account, uint256 fee) internal {
        if (fee > 0) {
            uint256 currentAllowance = _creditAllowance[account];
            if (currentAllowance < fee) revert NotEnoughCredit();
            unchecked {
                _creditAllowance[account] = currentAllowance - fee;
            }
        }
    }
}
