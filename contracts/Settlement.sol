// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@1inch/limit-order-protocol-contract/contracts/interfaces/IOrderMixin.sol";
import "@1inch/solidity-utils/contracts/libraries/SafeERC20.sol";
import "./interfaces/ISettlement.sol";
import "./interfaces/IResolver.sol";
import "./libraries/DynamicSuffix.sol";
import "./libraries/OrderSalt.sol";
import "./libraries/OrderPrefix.sol";
import "./FeeBankCharger.sol";

contract Settlement is ISettlement, FeeBankCharger {
    using SafeERC20 for IERC20;
    using OrderSalt for uint256;
    using DynamicSuffix for bytes;
    using AddressLib for Address;
    using OrderPrefix for IOrderMixin.Order;

    error AccessDenied();
    error IncorrectCalldataParams();
    error FailedExternalCall();
    error ResolverIsNotWhitelisted();
    error WrongInteractionTarget();

    bytes1 private constant _FINALIZE_INTERACTION = 0x01;
    uint256 private constant _ORDER_FEE_BASE_POINTS = 1e15;
    uint256 private constant _BASE_POINTS = 10_000_000; // 100%
    uint256 private constant _TAKING_FEE_BASE = 1e9;
    uint256 private constant _TAKING_FEE_RATIO_OFFSET = 160;

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
        _settleOrder(data, msg.sender, 0, "");
    }

    function settleOrdersWithPermits(bytes calldata data, bytes[] calldata permits) external {
        for (uint256 i = 0; i < permits.length; i++) {
            // TODO: concat permits and use 7 bits for each permit length
            IERC20(address(bytes20(permits[i]))).safePermit(permits[i][20:]);
        }
        _settleOrder(data, msg.sender, 0, "");
    }

    function takerInteraction(
        IOrderMixin.Order calldata order,
        bytes32 /* orderHash */,
        address taker,
        uint256 /* makingAmount */,
        uint256 takingAmount,
        uint256 /* remainingMakingAmount */,
        bytes calldata extraData
    ) external onlyThis(taker) onlyLimitOrderProtocol returns(uint256 offeredTakingAmount) {
        offeredTakingAmount = takingAmount * (_BASE_POINTS + order.rateBump()) / _BASE_POINTS;
        Address takingFee = order.takingFee();
        uint256 takingFeeAmount = offeredTakingAmount * takingFee.getUint32(_TAKING_FEE_RATIO_OFFSET) / _TAKING_FEE_BASE;

        (DynamicSuffix.Data calldata suffix, bytes calldata tokensAndAmounts, bytes calldata interaction) = extraData.decodeSuffix();
        IERC20 token = IERC20(order.takerAsset.get());

        // TODO: avoid double copying
        bytes memory allTokensAndAmounts = new bytes(tokensAndAmounts.length + 0x40);
        assembly ("memory-safe") {
            let ptr := add(allTokensAndAmounts, 0x20)
            calldatacopy(ptr, tokensAndAmounts.offset, tokensAndAmounts.length)
            ptr := add(ptr, tokensAndAmounts.length)
            mstore(ptr, token)
            mstore(add(ptr, 0x20), add(offeredTakingAmount, takingFeeAmount))
        }

        if (extraData[0] == _FINALIZE_INTERACTION) {
            _chargeFee(suffix.resolver.get(), suffix.resolverFee);
            IResolver(address(bytes20(interaction))).resolveOrders(suffix.resolver.get(), allTokensAndAmounts, interaction[20:]);
        } else {
            _settleOrder(interaction, suffix.resolver.get(), suffix.resolverFee, tokensAndAmounts);
        }

        if (takingFeeAmount > 0) {
            token.safeTransfer(takingFee.get(), takingFeeAmount);
        }
        token.forceApprove(address(_limitOrderProtocol), offeredTakingAmount);
    }

    bytes4 private constant _FILL_ORDER_TO_SELECTOR = 0xe5d7bde6; // IOrderMixin.fillOrderTo.selector
    bytes4 private constant _WRONG_INTERACTION_TARGET_SELECTOR = 0x5b34bf89; // WrongInteractionTarget.selector

    error IncorrectSelector();
    error OrderConstraintsAreWrong();

    struct FillOrderToArgs {
        IOrderMixin.Order order;
        bytes32 r;
        bytes32 vs;
        uint256 amount;
        TakerTraits takerTraits;
        address target;
        bytes interaction;
    }

    struct FillContractOrderArgs {
        IOrderMixin.Order order;
        bytes signature;
        uint256 amount;
        TakerTraits takerTraits;
        address target;
        bytes interaction;
        bytes permit;
    }

    function _settleOrder(bytes calldata data, address resolver, uint256 resolverFee, bytes memory tokensAndAmounts) private {
        bytes4 selector = bytes4(data);
        if (selector == IOrderMixin.fillOrderTo.selector) {
            FillOrderToArgs calldata args;
            assembly ("memory-safe") {
                args := add(data.offset, 4)
            }
            _settleOrderEOA(args, resolver, resolverFee, tokensAndAmounts);
        }
        else if (selector == IOrderMixin.fillContractOrder.selector) {
            FillContractOrderArgs calldata args;
            assembly ("memory-safe") {
                args := add(data.offset, 4)
            }
            _settleOrderContract(args, resolver, resolverFee, tokensAndAmounts);
        }
        else {
            revert IncorrectSelector();
        }
    }

    // input: [op1][op2][op3]
    // iter0:      [op2][op3][accumulator-suffix]
    // iter1:           [op3][accumulator-suffix]
    // iter2:                [accumulator-suffix]

    function _settleOrderEOA(FillOrderToArgs calldata args, address resolver, uint256 resolverFee, bytes memory tokensAndAmounts) private {

        if (uint256(keccak256(args.interaction)) & type(uint160).max != args.order.salt & type(uint160).max) revert OrderConstraintsAreWrong();

        // if (!order.checkResolver(resolver)) revert ResolverIsNotWhitelisted();
        // Address takingFeeData = order.takingFee();
        // resolverFee += order.salt.getFee() * _ORDER_FEE_BASE_POINTS;

        // uint256 rateBump = order.rateBump();
        // uint256 suffixLength = DynamicSuffix._STATIC_DATA_SIZE + tokensAndAmounts.length + 0x20;
        // IOrderMixin limitOrderProtocol = _limitOrderProtocol;

        // assembly {
        //     function memcpy(dst, src, len) {
        //         pop(staticcall(gas(), 0x4, src, len, dst, len))
        //     }

        //     let interactionLengthOffset := calldataload(add(data.offset, 0x40))
        //     let interactionOffset := add(interactionLengthOffset, 0x20)
        //     let interactionLength := calldataload(add(data.offset, interactionLengthOffset))

        //     { // stack too deep
        //         let target := shr(96, calldataload(add(data.offset, interactionOffset)))
        //         if or(lt(interactionLength, 20), iszero(eq(target, address()))) {
        //             mstore(0, _WRONG_INTERACTION_TARGET_SELECTOR)
        //             revert(0, 4)
        //         }
        //     }

        //     // Copy calldata and patch interaction.length
        //     let ptr := mload(0x40)
        //     mstore(ptr, _FILL_ORDER_TO_SELECTOR)
        //     calldatacopy(add(ptr, 4), data.offset, data.length)
        //     mstore(add(add(ptr, interactionLengthOffset), 4), add(interactionLength, suffixLength))

        //     {  // stack too deep
        //         // Append suffix fields
        //         let offset := add(add(ptr, interactionOffset), interactionLength)
        //         mstore(add(offset, 0x04), resolverFee)
        //         mstore(add(offset, 0x24), resolver)
        //         mstore(add(offset, 0x44), calldataload(add(order, 0x40)))  // takerAsset
        //         mstore(add(offset, 0x64), rateBump)
        //         mstore(add(offset, 0x84), takingFeeData)
        //         let tokensAndAmountsLength := mload(tokensAndAmounts)
        //         memcpy(add(offset, 0xa4), add(tokensAndAmounts, 0x20), tokensAndAmountsLength)
        //         mstore(add(offset, add(0xa4, tokensAndAmountsLength)), tokensAndAmountsLength)
        //     }

        //     // Call fillOrderTo
        //     if iszero(call(gas(), limitOrderProtocol, 0, ptr, add(add(4, suffixLength), data.length), ptr, 0)) {
        //         returndatacopy(ptr, 0, returndatasize())
        //         revert(ptr, returndatasize())
        //     }
        // }
    }

    function _settleOrderContract(FillContractOrderArgs calldata args, address resolver, uint256 resolverFee, bytes memory tokensAndAmounts) private {
        if (uint256(keccak256(args.interaction)) & type(uint160).max != args.order.salt & type(uint160).max) revert OrderConstraintsAreWrong();
    }
}
