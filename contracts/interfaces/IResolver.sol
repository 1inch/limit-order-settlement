// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import "@1inch/limit-order-protocol-contract/contracts/interfaces/IOrderMixin.sol";

interface IResolver {
    function takerInteraction(
        IOrderMixin.Order calldata order,
        bytes calldata extension,
        bytes32 orderHash ,
        address taker,
        uint256 makingAmount,
        uint256 takingAmount,
        uint256 remainingMakingAmount,
        bytes calldata extraData
    ) external;
}
