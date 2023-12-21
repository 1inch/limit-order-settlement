// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface IFeeBank {
    /**
     * @notice Returns the available credit for a given account in the FeeBank contract.
     * @param account The address of the account for which the available credit is being queried.
     * @return availableCredit The available credit of the queried account.
     */
    function availableCredit(address account) external view returns (uint256 availableCredit);

    /**
     * @notice Increases the caller's available credit by the specified amount.
     * @param amount The amount of credit to be added to the caller's account.
     * @return totalAvailableCredit The updated available credit of the caller's account.
     */
    function deposit(uint256 amount) external returns (uint256 totalAvailableCredit);

    /**
     * @notice Increases the specified account's available credit by the specified amount.
     * @param account The address of the account for which the available credit is being increased.
     * @param amount The amount of credit to be added to the account.
     * @return totalAvailableCredit The updated available credit of the specified account.
     */
    function depositFor(address account, uint256 amount) external returns (uint256 totalAvailableCredit);

    /**
     * @notice Increases the caller's available credit by a specified amount with permit.
     * @param amount The amount of credit to be added to the caller's account.
     * @param permit The permit data authorizing the transaction.
     * @return totalAvailableCredit The updated available credit of the caller's account.
     */
    function depositWithPermit(uint256 amount, bytes calldata permit) external returns (uint256 totalAvailableCredit);

    /**
     * @notice Increases the specified account's available credit by a specified amount with permit.
     * @param account The address of the account for which the available credit is being increased.
     * @param amount The amount of credit to be added to the account.
     * @param permit The permit data authorizing the transaction.
     * @return totalAvailableCredit The updated available credit of the specified account.
     */
    function depositForWithPermit(address account, uint256 amount, bytes calldata permit) external returns (uint256 totalAvailableCredit);

    /**
     * @notice Withdraws a specified amount of credit from the caller's account.
     * @param amount The amount of credit to be withdrawn from the caller's account.
     * @return totalAvailableCredit The updated available credit of the caller's account.
     */
    function withdraw(uint256 amount) external returns (uint256 totalAvailableCredit);

    /**
     * @notice Withdraws a specified amount of credit to the specified account.
     * @param account The address of the account to which the credit is being withdrawn.
     * @param amount The amount of credit to be withdrawn.
     * @return totalAvailableCredit The updated available credit of the caller's account.
     */
    function withdrawTo(address account, uint256 amount) external returns (uint256 totalAvailableCredit);
}
