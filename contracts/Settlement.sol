// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@1inch/limit-order-protocol-contract/contracts/interfaces/IOrderMixin.sol";
import "@1inch/solidity-utils/contracts/libraries/SafeERC20.sol";
import "./interfaces/ISettlement.sol";
import "./interfaces/IResolver.sol";
import "./libraries/DynamicSuffix.sol";
import "./libraries/OrderSaltParser.sol";
import "./libraries/OrderSuffix.sol";
import "./FeeBankCharger.sol";

contract Settlement is ISettlement, FeeBankCharger {
    using SafeERC20 for IERC20;
    using OrderSaltParser for uint256;
    using DynamicSuffix for bytes;
    using AddressLib for Address;
    using OrderSuffix for OrderLib.Order;
    using TakingFee for TakingFee.Data;

    error AccessDenied();
    error IncorrectCalldataParams();
    error FailedExternalCall();
    error ResolverIsNotWhitelisted();
    error WrongInteractionTarget();

    bytes32 private constant _FINALIZE_INTERACTION = bytes1(0x01);
    uint256 private constant _ORDER_FEE_BASE_POINTS = 1e15;
    uint256 private constant _BASE_POINTS = 10000; // 100%
    uint256 private constant _DEFAULT_INITIAL_RATE_BUMP = 1000; // 10%
    uint256 private constant _DEFAULT_DURATION = 30 minutes;

    IOrderMixin private immutable _limitOrderProtocol;

    modifier onlyThis(address account) {
        if (account != address(this)) revert AccessDenied();
        _;
    }

    modifier onlyLimitOrderProtocol {
        if (msg.sender != address(_limitOrderProtocol)) revert AccessDenied();
        _;
    }

    constructor(IOrderMixin limitOrderProtocol, IERC20 token)
        FeeBankCharger(token)
    {
        _limitOrderProtocol = limitOrderProtocol;
    }

    function settleOrders(bytes calldata data) external {
        _settleOrder(data, msg.sender, 0);
    }

    function fillOrderInteraction(
        address taker,
        uint256, /* makingAmount */
        uint256 takingAmount,
        bytes calldata interactiveData
    ) external onlyThis(taker) onlyLimitOrderProtocol returns (uint256 result) {
        DynamicSuffix.Data calldata suffix = interactiveData.decodeSuffix();

        if (interactiveData[0] == _FINALIZE_INTERACTION) {
            _chargeFee(suffix.resolver.get(), suffix.totalFee);
            (address target, bytes calldata data) = _decodeTargetAndCalldata(interactiveData[1:interactiveData.length - DynamicSuffix._DATA_SIZE]);
            IResolver(target).resolveOrders(suffix.resolver.get(), data);
        } else {
            _settleOrder(
                interactiveData[1:interactiveData.length - DynamicSuffix._DATA_SIZE],
                suffix.resolver.get(),
                suffix.totalFee
            );
        }

        result = takingAmount * (_BASE_POINTS + suffix.rateBump) / _BASE_POINTS;
        IERC20 token = IERC20(suffix.token.get());
        if (suffix.takingFee.enabled()) {
            token.safeTransfer(suffix.takingFee.receiver(), result * suffix.takingFee.ratio() / TakingFee._TAKING_FEE_BASE);
        }
        token.forceApprove(address(_limitOrderProtocol), result);
    }

    function _settleOrder(bytes calldata data, address resolver, uint256 totalFee) private {
        OrderLib.Order calldata order;
        assembly {
            order := add(data.offset, calldataload(data.offset))
        }
        TakingFee.Data takingFeeData = order.takingFee();
        totalFee += order.salt.getFee() * _ORDER_FEE_BASE_POINTS;
        if (!order.checkResolver(resolver)) revert ResolverIsNotWhitelisted();

        bytes4 selector = IOrderMixin.fillOrderTo.selector;
        bytes4 errorSelector = WrongInteractionTarget.selector;
        uint256 suffixLength = DynamicSuffix._DATA_SIZE;
        uint256 rateBump = order.rateBump();
        IOrderMixin limitOrderProtocol = _limitOrderProtocol;
        assembly {
            let interactionLengthOffset := calldataload(add(data.offset, 0x40))
            let interactionOffset := add(interactionLengthOffset, 0x20)
            let interactionLength := calldataload(add(data.offset, interactionLengthOffset))

            { // stack too deep
                let target := shr(96, calldataload(add(data.offset, interactionOffset)))
                if iszero(eq(target, address())) {
                    mstore(0, errorSelector)
                    revert(0, 4)
                }
            }

            // Copy calldata and patch interaction.length
            let ptr := mload(0x40)
            mstore(ptr, selector)
            calldatacopy(add(ptr, 4), data.offset, data.length)
            mstore(add(add(ptr, interactionLengthOffset), 4), add(interactionLength, suffixLength))

            {  // stack too deep
                // Append suffix fields
                let offset := add(add(ptr, interactionOffset), interactionLength)
                mstore(add(offset, 0x04), totalFee)
                mstore(add(offset, 0x24), resolver)
                mstore(add(offset, 0x44), calldataload(add(order, 0x40)))  // takerAsset
                mstore(add(offset, 0x64), rateBump)
                mstore(add(offset, 0x84), takingFeeData)
            }

            // Call fillOrderTo
            if iszero(call(gas(), limitOrderProtocol, 0, ptr, add(add(4, suffixLength), data.length), ptr, 0)) {
                returndatacopy(ptr, 0, returndatasize())
                revert(ptr, returndatasize())
            }
        }
    }

    function _decodeTargetAndCalldata(bytes calldata cd) private pure returns (address target, bytes calldata data) {
        assembly {
            target := shr(96, calldataload(cd.offset))
            data.offset := add(cd.offset, 20)
            data.length := sub(cd.length, 20)
        }
    }
}
