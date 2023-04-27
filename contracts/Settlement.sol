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
    error ResolverIsNotWhitelisted();
    error WrongInteractionTarget();
    error IncorrectSelector();
    error FusionDetailsMismatch();

    bytes1 private constant _FINALIZE_INTERACTION = 0x01;
    uint256 private constant _ORDER_FEE_BASE_POINTS = 1e15;
    uint256 private constant _BASE_POINTS = 10_000_000; // 100%
    uint256 private constant _TAKING_FEE_BASE = 1e9;
    uint256 private constant _TAKING_FEE_RATIO_OFFSET = 160;
    uint256 private constant _RESOLVER_ADDRESS_BYTES_SIZE = 10;

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

    function settleOrders(bytes calldata data) public virtual returns(bool) {
        _settleOrder(data, msg.sender, 0, msg.data[:0], IERC20(address(0)), 0);
        return true;
    }

    function takerInteraction(
        IOrderMixin.Order calldata order,
        bytes32 /* orderHash */,
        address taker,
        uint256 /* makingAmount */,
        uint256 takingAmount,
        uint256 /* remainingMakingAmount */,
        bytes calldata extraData
    ) public virtual onlyThis(taker) onlyLimitOrderProtocol returns(uint256 offeredTakingAmount) {
        bytes calldata fusionDetails = extraData[1:];
        fusionDetails = fusionDetails[:fusionDetails.detailsLength()];

        offeredTakingAmount = takingAmount * (_BASE_POINTS + fusionDetails.rateBump()) / _BASE_POINTS;
        Address takingFeeData = fusionDetails.takingFeeData();
        uint256 takingFeeAmount = offeredTakingAmount * takingFeeData.getUint32(_TAKING_FEE_RATIO_OFFSET) / _TAKING_FEE_BASE;

        (DynamicSuffix.Data calldata suffix, bytes calldata tokensAndAmounts, bytes calldata args) = extraData.decodeSuffix();
        args = args[fusionDetails.length:];  // remove fusion details
        IERC20 token = IERC20(order.takerAsset.get());

        address resolver = suffix.resolver.get();
        if (extraData[0] == _FINALIZE_INTERACTION) {
            bytes memory allTokensAndAmounts = new bytes(tokensAndAmounts.length + 0x40);
            assembly ("memory-safe") {
                let ptr := add(allTokensAndAmounts, 0x20)
                calldatacopy(ptr, tokensAndAmounts.offset, tokensAndAmounts.length)
                ptr := add(ptr, tokensAndAmounts.length)
                mstore(ptr, token)
                mstore(add(ptr, 0x20), add(offeredTakingAmount, takingFeeAmount))
            }

            _chargeFee(resolver, suffix.resolverFee);
            unchecked {
                uint256 resolversLength = uint8(args[args.length - 1]);
                IResolver(resolver).resolveOrders(allTokensAndAmounts, args[:args.length - 1 - resolversLength * _RESOLVER_ADDRESS_BYTES_SIZE]);
            }
        } else {
            unchecked {
                _settleOrder(args, resolver, suffix.resolverFee, tokensAndAmounts, token, offeredTakingAmount + takingFeeAmount);
            }
        }

        if (takingFeeAmount > 0) {
            token.safeTransfer(takingFeeData.get(), takingFeeAmount);
        }
        token.forceApprove(address(_limitOrderProtocol), offeredTakingAmount);
    }

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
    }

    function _getInteraction(bytes calldata data) internal pure returns(bytes calldata interaction) {
        bytes4 selector = bytes4(data);
        if (selector == IOrderMixin.fillOrderTo.selector) {
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

    function _settleOrder(bytes calldata args, address resolver, uint256 resolverFee, bytes calldata tokensAndAmounts, IERC20 token, uint256 newAmount) private {
        bytes calldata interaction = _getInteraction(args);
        bytes calldata fusionDetails = interaction[21:];
        fusionDetails = fusionDetails[:fusionDetails.detailsLength()];

        if (address(bytes20(interaction)) != address(this)) revert WrongInteractionTarget();
        // salt is the first word in Order struct, and we validate that lower 160 bits of salt are hash of fusionDetails
        if (uint256(fusionDetails.computeHash(args)) & type(uint160).max != uint256(bytes32(args[4:])) & type(uint160).max) revert FusionDetailsMismatch();
        if (!fusionDetails.checkResolver(resolver, args)) revert ResolverIsNotWhitelisted();

        uint256 suffixLength;
        unchecked {
            resolverFee += fusionDetails.resolverFee() * _ORDER_FEE_BASE_POINTS;
            suffixLength = DynamicSuffix._STATIC_DATA_SIZE +
                tokensAndAmounts.length +
                (address(token) != address(0) ? 0x60 : 0x20);
        }
        IOrderMixin limitOrderProtocol = _limitOrderProtocol;

        assembly ("memory-safe") {
            let resolversBytesSize := add(1, mul(_RESOLVER_ADDRESS_BYTES_SIZE, byte(0, calldataload(sub(add(args.offset, args.length), 1)))))
            let interactionOffset := sub(interaction.offset, args.offset)

            // Copy calldata and patch interaction.length
            let ptr := mload(0x40)
            calldatacopy(ptr, args.offset, args.length)
            mstore(add(ptr, sub(interactionOffset, 0x20)), add(add(interaction.length, suffixLength), resolversBytesSize))

            {  // stack too deep
                let offset := add(add(ptr, interactionOffset), interaction.length)
                // Append resolvers
                calldatacopy(offset, sub(add(args.offset, args.length), resolversBytesSize), resolversBytesSize)
                offset := add(offset, resolversBytesSize)
                // Append suffix fields
                mstore(offset, resolver)
                mstore(add(offset, 0x20), resolverFee)
                calldatacopy(add(offset, 0x40), tokensAndAmounts.offset, tokensAndAmounts.length)

                let pointer := add(offset, add(0x40, tokensAndAmounts.length))
                switch token
                case 0 {
                    mstore(pointer, 0)
                }
                default {
                    mstore(pointer, token)
                    mstore(add(pointer, 0x20), newAmount)
                    mstore(add(pointer, 0x40), add(tokensAndAmounts.length, 0x40))
                }
            }

            // Call fillOrderTo
            if iszero(call(gas(), limitOrderProtocol, 0, ptr, add(add(args.length, suffixLength), resolversBytesSize), 0, 0)) {
                returndatacopy(ptr, 0, returndatasize())
                revert(ptr, returndatasize())
            }
        }
    }
}
