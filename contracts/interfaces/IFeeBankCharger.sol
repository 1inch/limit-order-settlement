// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import "./IFeeBank.sol";

interface IFeeBankCharger {
    function feeBank() external view returns (IFeeBank);
    function availableCredit(address account) external view returns (uint256);
    function increaseAvailableCredit(address account, uint256 amount) external returns (uint256 allowance);
    function decreaseAvailableCredit(address account, uint256 amount) external returns (uint256 allowance);
}
