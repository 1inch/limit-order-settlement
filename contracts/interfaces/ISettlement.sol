// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import "@1inch/limit-order-protocol-contract/contracts/interfaces/ITakerInteraction.sol";
import "./IFeeBankCharger.sol";

interface ISettlement is ITakerInteraction, IFeeBankCharger {
    function settleOrders(bytes calldata order) external returns(bool);
}
