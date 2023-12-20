// SPDX-License-Identifier: MIT

pragma solidity 0.8.23;

import "../SettlementExtension.sol";

contract SettlementExtensionMock is SettlementExtension {
    constructor(IOrderMixin limitOrderProtocol, IERC20 token)
        SettlementExtension(limitOrderProtocol, token)
    {}

    function decreaseAvailableCreditMock(address account, uint256 amount) external {
        _chargeFee(account, amount);
    }
}
