// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "../Settlement.sol";

contract SettlementMock is Settlement {
    constructor(IOrderMixin limitOrderProtocol, IERC20 token)
        Settlement(limitOrderProtocol, token)
    {}  // solhint-disable-line no-empty-blocks

    function decreaseAvailableCreditMock(address account, uint256 amount) external {
        _chargeFee(account, amount);
    }
}
