// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../interfaces/ISettlement.sol";
import "../interfaces/IFeeBank.sol";

contract ProxySettlement {
    ISettlement private _settlement;
    IERC20 private _inch;
    IFeeBank private _feeBank;

    constructor(
        ISettlement settlement,
        IERC20 inch,
        IFeeBank feeBank
    ) {
        _settlement = settlement;
        _inch = inch;
        _feeBank = feeBank;
    }

    function deposit(uint256 amount) external {
        _inch.approve(address(_feeBank), amount);
        _feeBank.deposit(amount);
    }

    function settleOrders(bytes calldata data) external {
        _settlement.settleOrders(data);
    }
}
