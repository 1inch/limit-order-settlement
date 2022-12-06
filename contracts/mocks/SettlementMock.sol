// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "../Settlement.sol";

contract SettlementMock is Settlement {
    constructor(IOrderMixin limitOrderProtocol, IERC20 token)
        Settlement(limitOrderProtocol, token)
    {}

    function chargeFee(address account, address receiver, uint256 amount) external {
        _chargeFee(account, amount);
        _addReward(receiver, amount);
    }
}
