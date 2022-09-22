// SPDX-License-Identifier: MIT

pragma solidity 0.8.15;

import "@1inch/limit-order-protocol/contracts/interfaces/NotificationReceiver.sol";
import "@1inch/limit-order-protocol/contracts/interfaces/IOrderMixin.sol";

interface ISettlement is InteractionNotificationReceiver {
    function matchOrders(
        IOrderMixin orderMixin,
        OrderLib.Order calldata order,
        bytes calldata signature,
        bytes calldata interaction,
        uint256 makingAmount,
        uint256 takingAmount,
        uint256 thresholdAmount
    ) external;

    function matchOrdersEOA(
        IOrderMixin orderMixin,
        OrderLib.Order calldata order,
        bytes calldata signature,
        bytes calldata interaction,
        uint256 makingAmount,
        uint256 takingAmount,
        uint256 thresholdAmount
    ) external;

    function creditAllowance(address account) external returns (uint256);

    function addCreditAllowance(address account, uint256 amount) external returns (uint256);

    function subCreditAllowance(address account, uint256 amount) external returns (uint256);
}
