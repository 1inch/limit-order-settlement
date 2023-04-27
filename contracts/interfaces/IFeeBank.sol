// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

interface IFeeBank {
    /**
     * @notice Returns account's availableCredit in Settlement contract.
     * @param account The account whose availableCredit is increased by the sender.
     * @return availableCredit The total account's availableCredit after deposit.
     */
    function availableCredit(address account) external view returns (uint256 availableCredit);

    /**
     * @notice Increment sender's availableCredit in Settlement contract.
     * @param amount The amount of 1INCH sender pays for increase.
     * @return totalAvailableCredit The total sender's availableCredit after deposit.
     */
    function deposit(uint256 amount) external returns (uint256 totalAvailableCredit);

    /**
     * @notice Increases account's availableCredit in Settlement contract.
     * @param account The account whose availableCredit is increased by the sender.
     * @param amount The amount of 1INCH sender pays for increase.
     * @return totalAvailableCredit The total account's availableCredit after deposit.
     */
    function depositFor(address account, uint256 amount) external returns (uint256 totalAvailableCredit);

    /**
     * @notice This method uses permit for deposit without prior approves.
     * @param amount The amount of 1INCH sender pays for increase.
     * @param permit The data with sender's permission via token.
     * @return totalAvailableCredit The total sender's availableCredit after deposit.
     */
    function depositWithPermit(uint256 amount, bytes calldata permit) external returns (uint256 totalAvailableCredit);

    /**
     * @notice This method uses permit to deposit to the account without prior approves.
     * @param account The account whose availableCredit is increased by the sender.
     * @param amount The amount of 1INCH sender pays for increase.
     * @param permit The data with sender's permission via token.
     * @return totalAvailableCredit The total sender's availableCredit after deposit.
     */
    function depositForWithPermit(address account, uint256 amount, bytes calldata permit) external returns (uint256 totalAvailableCredit);

    /**
     * @notice Returns unspent availableCredit.
     * @param amount The amount of 1INCH returned to the sender.
     * @return totalAvailableCredit The total sender's availableCredit after withdrawal.
     */
    function withdraw(uint256 amount) external returns (uint256 totalAvailableCredit);

    /**
     * @notice Returns unspent availableCredit to specific account.
     * @param account The account which gets withdrawn tokens.
     * @param amount The amount of withdrawn tokens.
     * @return totalAvailableCredit The total sender's availableCredit after withdrawal.
     */
    function withdrawTo(address account, uint256 amount) external returns (uint256 totalAvailableCredit);
}
