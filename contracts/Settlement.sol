// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@1inch/limit-order-protocol-contract/contracts/interfaces/IOrderMixin.sol";
import "@1inch/solidity-utils/contracts/libraries/SafeERC20.sol";
import "./interfaces/ISettlement.sol";
import "./interfaces/IResolver.sol";
import "./libraries/DynamicSuffix.sol";
import "./libraries/FusionDetails.sol";
import "./FeeBankCharger.sol";

contract Settlement is ISettlement, FeeBankCharger {
    using SafeERC20 for IERC20;
    using DynamicSuffix for bytes;
    using AddressLib for Address;
    using FusionDetails for bytes;

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
        bytes calldata fusionDetails = extraData[:extraData.detailsLength()];

        offeredTakingAmount = takingAmount * (_BASE_POINTS + fusionDetails.rateBump()) / _BASE_POINTS;
        Address takingFee = fusionDetails.takingFee();
        uint256 takingFeeAmount = offeredTakingAmount * takingFee.getUint32(_TAKING_FEE_RATIO_OFFSET) / _TAKING_FEE_BASE;

        (DynamicSuffix.Data calldata suffix, bytes calldata tokensAndAmounts, bytes calldata interaction) = extraData.decodeSuffix();
        interaction = interaction[fusionDetails.length:];  // remove fusion details
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
            _settleOrder(interaction, suffix.resolver.get(), suffix.resolverFee, allTokensAndAmounts);
        }

        if (takingFeeAmount > 0) {
            token.safeTransfer(takingFee.get(), takingFeeAmount);
        }
        token.forceApprove(address(_limitOrderProtocol), offeredTakingAmount);
    }

    bytes4 private constant _FILL_ORDER_TO_SELECTOR = 0xe5d7bde6; // IOrderMixin.fillOrderTo.selector TODO fix
    bytes4 private constant _WRONG_INTERACTION_TARGET_SELECTOR = 0x5b34bf89; // WrongInteractionTarget.selector

    error IncorrectSelector();
    error FusionDetailsMismatch();

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
        // bytes permit;
    }

    function _getInteraction(bytes calldata data) internal pure returns(bytes calldata interaction) {
        bytes4 selector = bytes4(data);
        if (selector == _FILL_ORDER_TO_SELECTOR) {
            FillOrderToArgs calldata args;
            assembly ("memory-safe") {
                args := add(data.offset, 4)
            }
            interaction = args.interaction;
        }
        else if (selector == IOrderMixin.fillContractOrder.selector) {
            FillContractOrderArgs calldata args;
            assembly ("memory-safe") {
                args := add(data.offset, 4)
            }
            interaction = args.interaction;
        }
        else {
            revert IncorrectSelector();
        }
    }

    function _settleOrder(bytes calldata args, address resolver, uint256 resolverFee, bytes memory tokensAndAmounts) private {
        bytes calldata interaction = _getInteraction(args);
        bytes calldata fusionDetails = interaction[:interaction.detailsLength()];

        {
            bytes calldata targetAndInteraction = interaction[fusionDetails.length:];
            if (targetAndInteraction.length < 20 || address(bytes20(targetAndInteraction)) != address(this)) revert WrongInteractionTarget();
        }

        if (uint256(keccak256(fusionDetails)) & type(uint160).max != uint256(bytes32(args)) & type(uint160).max) revert FusionDetailsMismatch();

        if (!fusionDetails.checkResolver(resolver)) revert ResolverIsNotWhitelisted();

        // todo: unchecked
        resolverFee += fusionDetails.resolverFee() * _ORDER_FEE_BASE_POINTS;

        // todo: unchecked
        uint256 suffixLength = DynamicSuffix._STATIC_DATA_SIZE + tokensAndAmounts.length + 0x20;
        IOrderMixin limitOrderProtocol = _limitOrderProtocol;

        assembly {
            function memcpy(dst, src, len) {
                pop(staticcall(gas(), 0x4, src, len, dst, len))
            }

            let interactionOffset := sub(interaction.offset, args.offset)
            let interactionLengthOffset := sub(interactionOffset, 0x20)

            // Copy calldata and patch interaction.length
            let ptr := mload(0x40)
            mstore(ptr, _FILL_ORDER_TO_SELECTOR)
            ptr := add(ptr, 4)
            calldatacopy(ptr, args.offset, args.length)
            mstore(add(ptr, interactionLengthOffset), add(interaction.length, suffixLength))

            {  // stack too deep
                // Append suffix fields
                let offset := add(add(ptr, interactionOffset), interaction.length)
                mstore(add(offset, 0x00), resolver)
                mstore(add(offset, 0x20), resolverFee)
                let tokensAndAmountsLength := mload(tokensAndAmounts)
                memcpy(add(offset, 0x40), add(tokensAndAmounts, 0x20), tokensAndAmountsLength)
                mstore(add(offset, add(0x40, tokensAndAmountsLength)), tokensAndAmountsLength)
            }

            // Call fillOrderTo
            if iszero(call(gas(), limitOrderProtocol, 0, sub(ptr, 4), add(args.length, suffixLength), 0, 0)) {
                returndatacopy(ptr, 0, returndatasize())
                revert(ptr, returndatasize())
            }
        }
    }
}
