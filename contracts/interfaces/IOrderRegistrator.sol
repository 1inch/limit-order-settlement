// SPDX-License-Identifier: MIT

pragma solidity 0.8.23;

import { IOrderMixin } from "@1inch/limit-order-protocol-contract/contracts/interfaces/IOrderMixin.sol";

// TODO: import from limit-order-protocol
interface IOrderRegistrator {
    event OrderRegistered(IOrderMixin.Order order, bytes extension, bytes signature);

    function registerOrder(IOrderMixin.Order calldata order, bytes calldata extension, bytes calldata signature) external;
}
