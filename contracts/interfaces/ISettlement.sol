// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import "@1inch/limit-order-protocol/contracts/interfaces/NotificationReceiver.sol";
import "@1inch/limit-order-protocol/contracts/interfaces/IOrderMixin.sol";
import "./IFeeBankCharger.sol";

interface ISettlement is InteractionNotificationReceiver, IFeeBankCharger {
    function settleOrders(bytes calldata order) external;
}
