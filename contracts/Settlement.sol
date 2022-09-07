// SPDX-License-Identifier: MIT

pragma solidity 0.8.15;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@1inch/limit-order-protocol/contracts/interfaces/NotificationReceiver.sol";
import "@1inch/limit-order-protocol/contracts/interfaces/IOrderMixin.sol";
import "./helpers/WhitelistChecker.sol";
import "./interfaces/IWhitelistRegistry.sol";

contract Settlement is InteractionNotificationReceiver, WhitelistChecker {
    bytes1 private constant _FINALIZE_INTERACTION = 0x01;

    error IncorrectCalldataParams();
    error FailedExternalCall();

    constructor(IWhitelistRegistry whitelist, address limitOrderProtocol)
        WhitelistChecker(whitelist, limitOrderProtocol)
    {} // solhint-disable-line no-empty-blocks

    function matchOrders(
        IOrderMixin orderMixin,
        OrderLib.Order calldata order,
        bytes calldata signature,
        bytes calldata interaction,
        uint256 makingAmount,
        uint256 takingAmount,
        uint256 thresholdAmount
    ) external onlyWhitelisted(msg.sender) {
        orderMixin.fillOrder(
            order,
            signature,
            interaction,
            makingAmount,
            takingAmount,
            thresholdAmount
        );
    }

    function matchOrdersEOA(
        IOrderMixin orderMixin,
        OrderLib.Order calldata order,
        bytes calldata signature,
        bytes calldata interaction,
        uint256 makingAmount,
        uint256 takingAmount,
        uint256 thresholdAmount
    ) external onlyWhitelistedEOA {
        orderMixin.fillOrder(
            order,
            signature,
            interaction,
            makingAmount,
            takingAmount,
            thresholdAmount
        );
    }

    function fillOrderInteraction(
        address, /* taker */
        uint256, /* makingAmount */
        uint256, /* takingAmount */
        bytes calldata interactiveData
    ) external onlyLimitOrderProtocol returns (uint256) {
        if (interactiveData[0] == _FINALIZE_INTERACTION) {
            (address[] memory targets, bytes[] memory calldatas) = abi.decode(
                interactiveData[1:],
                (address[], bytes[])
            );

            if (targets.length != calldatas.length)
                revert IncorrectCalldataParams();
            for (uint256 i = 0; i < targets.length; i++) {
                // solhint-disable-next-line avoid-low-level-calls
                (bool success, ) = targets[i].call(calldatas[i]);
                if (!success) revert FailedExternalCall();
            }
        } else {
            (
                OrderLib.Order memory order,
                bytes memory signature,
                bytes memory interaction,
                uint256 makingOrderAmount,
                uint256 takingOrderAmount,
                uint256 thresholdAmount
            ) = abi.decode(
                    interactiveData[1:],
                    (OrderLib.Order, bytes, bytes, uint256, uint256, uint256)
                );

            IOrderMixin(msg.sender).fillOrder(
                order,
                signature,
                interaction,
                makingOrderAmount,
                takingOrderAmount,
                thresholdAmount
            );
        }
        return 0;
    }
}
