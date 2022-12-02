// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

interface IResolver {
    function resolveOrders(address resolver, bytes calldata data) external;
}
