// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface IResolver {
    function resolveOrders(bytes calldata tokensAndAmounts, bytes calldata data) external returns(bool);
}
