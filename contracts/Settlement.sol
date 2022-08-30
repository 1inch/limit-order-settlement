// SPDX-License-Identifier: MIT

pragma solidity 0.8.15;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@1inch/limit-order-protocol/contracts/interfaces/NotificationReceiver.sol";
import "@1inch/limit-order-protocol/contracts/interfaces/IOrderMixin.sol";
import "./helpers/WhitelistChecker.sol";
import "./interfaces/IWhitelistRegistry.sol";

contract Settlement is Ownable, InteractionNotificationReceiver, WhitelistChecker {
    bytes1 private constant _FINALIZE_INTERACTION = 0x01;
    uint256 private constant _ORDER_FEE_MASK = 0x00000000000000000000FFFFFFFFFFFFFFFFFF00000000000000000000000000;

    error IncorrectCalldataParams();
    error FailedExternalCall();
    error OnlyFeeBankAccess();
    error NotEnoughCredit();

    address public feeBank;
    mapping(address => uint256) public creditAllowance;

    modifier onlyFeeBank() {
        if (msg.sender != feeBank) revert OnlyFeeBankAccess();
        _;
    }

    // solhint-disable-next-line no-empty-blocks
    constructor(IWhitelistRegistry whitelist, address limitOrderProtocol) WhitelistChecker(whitelist, limitOrderProtocol) {}

    function matchOrders(
        IOrderMixin orderMixin,
        OrderLib.Order calldata order,
        bytes calldata signature,
        bytes calldata interaction,
        uint256 makingAmount,
        uint256 takingAmount,
        uint256 thresholdAmount
    )
        external
        onlyWhitelisted(msg.sender)
    {
        _matchOrder(
            orderMixin,
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
    )
        external
        onlyWhitelistedEOA()
    {
        _matchOrder(
            orderMixin,
            order,
            signature,
            interaction,
            makingAmount,
            takingAmount,
            thresholdAmount
        );
    }

    function fillOrderInteraction(
        address /* taker */,
        uint256 /* makingAmount */,
        uint256 /* takingAmount */,
        bytes calldata interactiveData
    )
        external
        onlyLimitOrderProtocol()
        returns(uint256)
    {
        if(interactiveData[0] == _FINALIZE_INTERACTION) {
            (
                address[] memory targets,
                bytes[] memory calldatas
            ) = abi.decode(interactiveData[1:], (address[], bytes[]));

            if(targets.length != calldatas.length) revert IncorrectCalldataParams();
            for(uint256 i = 0; i < targets.length; i++) {
                // solhint-disable-next-line avoid-low-level-calls
                (bool success, ) = targets[i].call(calldatas[i]);
                if(!success) revert FailedExternalCall();
            }
        } else {
            (
                OrderLib.Order memory order,
                bytes memory signature,
                bytes memory interaction,
                uint256 makingOrderAmount,
                uint256 takingOrderAmount,
                uint256 thresholdAmount
            ) = abi.decode(interactiveData[1:], (OrderLib.Order, bytes, bytes, uint256, uint256, uint256));

            _matchOrder(
                IOrderMixin(msg.sender),
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

    function _matchOrder(
        IOrderMixin orderMixin,
        OrderLib.Order memory order,
        bytes memory signature,
        bytes memory interaction,
        uint256 makingAmount,
        uint256 takingAmount,
        uint256 thresholdAmount
    ) private {
        uint256 orderFee = (order.salt & _ORDER_FEE_MASK) >> (256 - 80 - 72);
        if (creditAllowance[tx.origin] < orderFee) revert NotEnoughCredit(); // solhint-disable-line avoid-tx-origin
        creditAllowance[tx.origin] -= orderFee; // solhint-disable-line avoid-tx-origin
        orderMixin.fillOrder(
            order,
            signature,
            interaction,
            makingAmount,
            takingAmount,
            thresholdAmount
        );
    }

    function addCreditAllowance(address account, uint256 amount) external onlyFeeBank() returns(uint256) {
        creditAllowance[account] += amount;
        return creditAllowance[account];
    }

    function subCreditAllowance(address account, uint256 amount) external onlyFeeBank() returns(uint256) {
        creditAllowance[account] -= amount;
        return creditAllowance[account];
    }

    function setFeeBank(address newFeeBank) external onlyOwner {
        feeBank = newFeeBank;
    }
}
