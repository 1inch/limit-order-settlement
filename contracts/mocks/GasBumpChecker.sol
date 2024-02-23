// SPDX-License-Identifier: MIT

pragma solidity 0.8.23;

import { IOrderMixin } from "@1inch/limit-order-protocol-contract/contracts/interfaces/IOrderMixin.sol";
import { BaseExtension } from "../extensions/BaseExtension.sol";

contract GasBumpChecker is BaseExtension {
    error InvalidResult(uint256 actual, uint256 expected);

    constructor() BaseExtension(address(this)) {}

    function testGetTakingAmount(
        IOrderMixin.Order calldata order,
        bytes calldata extension,
        bytes32 orderHash,
        address taker,
        uint256 makingAmount,
        uint256 remainingMakingAmount,
        bytes calldata extraData,
        uint256 expectedResult
    ) external payable {
        uint256 res = this.getTakingAmount(
            order,
            extension,
            orderHash,
            taker,
            makingAmount,
            remainingMakingAmount,
            extraData
        );
        if (res != expectedResult) revert InvalidResult(res, expectedResult);
    }
}
