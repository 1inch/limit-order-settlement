// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { IFeeBank } from "./IFeeBank.sol";

interface IFeeBankCharger {
    /**
     * @notice Returns the instance of the FeeBank contract.
     * @return The instance of the FeeBank contract.
     */
    function FEE_BANK() external view returns (IFeeBank); // solhint-disable-line func-name-mixedcase

    /**
     * @notice Returns the available credit for a given account.
     * @param account The address of the account for which the available credit is being queried.
     * @return The available credit of the queried account.
     */
    function availableCredit(address account) external view returns (uint256);

    /**
     * @notice Increases the available credit of a given account by a specified amount.
     * @param account The address of the account for which the available credit is being increased.
     * @param amount The amount by which the available credit will be increased.
     * @return allowance The updated available credit of the specified account.
     */
    function increaseAvailableCredit(address account, uint256 amount) external returns (uint256 allowance);

    /**
     * @notice Decreases the available credit of a given account by a specified amount.
     * @param account The address of the account for which the available credit is being decreased.
     * @param amount The amount by which the available credit will be decreased.
     * @return allowance The updated available credit of the specified account.
     */
    function decreaseAvailableCredit(address account, uint256 amount) external returns (uint256 allowance);
}
