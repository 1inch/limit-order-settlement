// SPDX-License-Identifier: MIT

pragma solidity 0.8.15;

import "../../contracts/Settlement.sol";

contract SettlementMock is Settlement {

    // solhint-disable-next-line no-empty-blocks
    constructor(IWhitelistRegistry whitelist, address limitOrderProtocol) Settlement(whitelist, limitOrderProtocol) {}

    function fillOrderPreInteraction(
        bytes32 /*orderHash*/,
        address /*maker*/,
        address /*taker*/,
        uint256 /*makingAmount*/,
        uint256 /*takingAmount*/,
        uint256 /*remainingAmount*/,
        bytes calldata interactiveData
    )
        external
        onlyLimitOrderProtocol()
        returns(uint256)
    {
        (
            IOrderMixin orderMixin,
            OrderLib.Order memory order,
            bytes memory signature,
            bytes memory interaction,
            uint256 makingAmount,
            uint256 takingAmount,
            uint256 thresholdAmount
        ) = abi.decode(interactiveData[1:], (IOrderMixin, OrderLib.Order, bytes, bytes, uint256, uint256, uint256));

        this.matchOrders(
            orderMixin,
            order,
            signature,
            interaction,
            makingAmount,
            takingAmount,
            thresholdAmount
        );
        return 0;
    }
}
