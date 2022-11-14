// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@1inch/limit-order-protocol/contracts/interfaces/NotificationReceiver.sol";
import "@1inch/limit-order-protocol/contracts/interfaces/IOrderMixin.sol";
import "./helpers/WhitelistChecker.sol";
import "./libraries/OrderSaltParser.sol";
import "./interfaces/IWhitelistRegistry.sol";
import "./interfaces/ISettlement.sol";
import "./FeeBankCharger.sol";

contract Settlement is ISettlement, Ownable, WhitelistChecker, FeeBankCharger {
    using OrderSaltParser for uint256;

    bytes1 private constant _FINALIZE_INTERACTION = 0x01;
    uint256 private constant _ORDER_FEE_BASE_POINTS = 1e15;
    uint16 private constant _BASE_POINTS = 10000; // 100%
    uint16 private constant _DEFAULT_INITIAL_RATE_BUMP = 1000; // 10%
    uint32 private constant _DEFAULT_DURATION = 30 minutes;

    error IncorrectCalldataParams();
    error FailedExternalCall();

    constructor(IWhitelistRegistry whitelist, address limitOrderProtocol, IERC20 token)
        WhitelistChecker(whitelist, limitOrderProtocol) FeeBankCharger(token)
    {}  // solhint-disable-line no-empty-blocks

    function settleOrders(
        IOrderMixin orderMixin,
        OrderLib.Order calldata order,
        bytes calldata signature,
        bytes calldata interaction,
        uint256 makingAmount,
        uint256 takingAmount,
        uint256 thresholdAmount,
        address target
    ) external onlyWhitelisted(msg.sender) {
        _settleOrder(
            orderMixin,
            order,
            msg.sender,
            signature,
            interaction,
            makingAmount,
            takingAmount,
            thresholdAmount,
            target
        );
    }

    function fillOrderInteraction(
        address, /* taker */
        uint256, /* makingAmount */
        uint256 takingAmount,
        bytes calldata interactiveData
    ) external returns (uint256) {
        address interactor = _interactionAuth();
        if (interactiveData[0] == _FINALIZE_INTERACTION) {
            (address[] calldata targets, bytes[] calldata calldatas) = _abiDecodeFinal(interactiveData[1:]);

            uint256 length = targets.length;
            if (length != calldatas.length) revert IncorrectCalldataParams();
            for (uint256 i = 0; i < length; i++) {
                // solhint-disable-next-line avoid-low-level-calls
                (bool success, ) = targets[i].call(calldatas[i]);
                if (!success) revert FailedExternalCall();
            }
        } else {
            (
                OrderLib.Order calldata order,
                bytes calldata signature,
                bytes calldata interaction,
                uint256 makingOrderAmount,
                uint256 takingOrderAmount,
                uint256 thresholdAmount,
                address target
            ) = _abiDecodeIteration(interactiveData[1:]);

            _settleOrder(
                IOrderMixin(msg.sender),
                order,
                interactor,
                signature,
                interaction,
                makingOrderAmount,
                takingOrderAmount,
                thresholdAmount,
                target
            );
        }
        uint256 salt = uint256(bytes32(interactiveData[interactiveData.length - 32:]));
        return (takingAmount * _calculateRateBump(salt)) / _BASE_POINTS;
    }

    function _calculateRateBump(uint256 salt) internal view returns (uint256) {
        uint256 orderStartTime = salt.getStartTime();
        uint256 duration = salt.getDuration();
        uint256 initialRateBump = salt.getInitialRateBump();
        if (duration == 0) {
            duration = _DEFAULT_DURATION;
        }
        if (initialRateBump == 0) {
            initialRateBump = _DEFAULT_INITIAL_RATE_BUMP;
        }

        unchecked {
            // solhint-disable-next-line not-rely-on-time
            if (block.timestamp > orderStartTime) {
                // solhint-disable-next-line not-rely-on-time
                uint256 timePassed = block.timestamp - orderStartTime;
                return
                    timePassed < duration
                        ? _BASE_POINTS + (initialRateBump * (duration - timePassed)) / duration
                        : _BASE_POINTS;
            } else {
                return _BASE_POINTS + initialRateBump;
            }
        }
    }

    function _settleOrder(
        IOrderMixin orderMixin,
        OrderLib.Order calldata order,
        address interactor,
        bytes calldata signature,
        bytes calldata interaction,
        uint256 makingAmount,
        uint256 takingAmount,
        uint256 thresholdAmount,
        address target
    ) private {
        _chargeFee(interactor, order.salt.getFee() * _ORDER_FEE_BASE_POINTS);
        bytes memory patchedInteraction = abi.encodePacked(interaction, order.salt);
        orderMixin.fillOrderTo(
            order,
            signature,
            patchedInteraction,
            makingAmount,
            takingAmount,
            thresholdAmount,
            target
        );
    }

    function _abiDecodeFinal(bytes calldata cd)
        private
        pure
        returns (address[] calldata targets, bytes[] calldata calldatas)
    {
        // solhint-disable-next-line no-inline-assembly
        assembly {
            let ptr := add(cd.offset, calldataload(cd.offset))
            targets.offset := add(ptr, 0x20)
            targets.length := calldataload(ptr)

            ptr := add(cd.offset, calldataload(add(cd.offset, 0x20)))
            calldatas.offset := add(ptr, 0x20)
            calldatas.length := calldataload(ptr)
        }
    }

    function _abiDecodeIteration(bytes calldata cd)
        private
        pure
        returns (
            OrderLib.Order calldata order,
            bytes calldata signature,
            bytes calldata interaction,
            uint256 makingOrderAmount,
            uint256 takingOrderAmount,
            uint256 thresholdAmount,
            address target
        )
    {
        // solhint-disable-next-line no-inline-assembly
        assembly {
            order := add(cd.offset, calldataload(cd.offset))

            let ptr := add(cd.offset, calldataload(add(cd.offset, 0x20)))
            signature.offset := add(ptr, 0x20)
            signature.length := calldataload(ptr)

            ptr := add(cd.offset, calldataload(add(cd.offset, 0x40)))
            interaction.offset := add(ptr, 0x20)
            interaction.length := calldataload(ptr)

            makingOrderAmount := calldataload(add(cd.offset, 0x60))
            takingOrderAmount := calldataload(add(cd.offset, 0x80))
            thresholdAmount := calldataload(add(cd.offset, 0xa0))
            target := calldataload(add(cd.offset, 0xc0))
        }
    }
}
