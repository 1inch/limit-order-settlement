// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@1inch/limit-order-protocol-contract/contracts/interfaces/ITakerInteraction.sol";
import "./IFeeBankCharger.sol";

interface ISettlement is ITakerInteraction, IFeeBankCharger {
    function settleOrders(bytes calldata order) external returns(bool);
}
