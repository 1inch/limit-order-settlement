// SPDX-License-Identifier: MIT

pragma solidity 0.8.23;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { Settlement } from "../Settlement.sol";

contract SettlementMock is Settlement {
    constructor(address limitOrderProtocol, IERC20 token, IERC20 accessToken, address weth)
        Settlement(limitOrderProtocol, token, accessToken, weth, msg.sender)
    {}

    function decreaseAvailableCreditMock(address account, uint256 amount) external {
        _chargeFee(account, amount);
    }
}
