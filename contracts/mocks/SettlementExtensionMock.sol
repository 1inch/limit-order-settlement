// SPDX-License-Identifier: MIT

pragma solidity 0.8.23;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IOrderMixin } from "@1inch/limit-order-protocol-contract/contracts/interfaces/IOrderMixin.sol";
import { SettlementExtension } from "../SettlementExtension.sol";

contract SettlementExtensionMock is SettlementExtension {
    constructor(IOrderMixin limitOrderProtocol, IERC20 token)
        SettlementExtension(limitOrderProtocol, token)
    {}

    function decreaseAvailableCreditMock(address account, uint256 amount) external {
        _chargeFee(account, amount);
    }
}
