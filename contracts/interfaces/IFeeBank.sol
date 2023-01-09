// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

interface IFeeBank {
    function availableCredit(address account) external view returns (uint256);
    function deposit(uint256 amount) external returns (uint256 totalAvailableCredit);
    function depositFor(address account, uint256 amount) external returns (uint256 totalAvailableCredit);
    function depositWithPermit(uint256 amount, bytes calldata permit) external returns (uint256 totalAvailableCredit);
    function depositForWithPermit(address account, uint256 amount, bytes calldata permit) external returns (uint256 totalAvailableCredit);
    function withdraw(uint256 amount) external returns (uint256 totalAvailableCredit);
    function withdrawTo(address account, uint256 amount) external returns (uint256 totalAvailableCredit);
}
