// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

interface IResolver {
    function resolveOrders(bytes calldata data) external;
}
