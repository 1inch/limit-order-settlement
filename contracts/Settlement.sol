// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@1inch/limit-order-protocol-contract/contracts/interfaces/IOrderMixin.sol";
import "@1inch/solidity-utils/contracts/libraries/SafeERC20.sol";
import "./interfaces/ISettlement.sol";
import "./interfaces/IResolver.sol";
import "./libraries/DynamicSuffix.sol";
import "./libraries/OrderSaltParser.sol";
import "./FeeBankCharger.sol";

contract Settlement is ISettlement, FeeBankCharger {
    using SafeERC20 for IERC20;
    using AddressLib for Address;
    using OrderSaltParser for uint256;
    using DynamicSuffix for DynamicSuffix.Data;

    error AccessDenied();
    error IncorrectCalldataParams();
    error FailedExternalCall();
    error ResolverIsNotWhitelisted();
    error WrongInteractionTarget();

    uint256 private constant _FINALIZE_INTERACTION = 0x01;
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
        DynamicSuffix.TokenAndAmount[] calldata tamanuts;
        assembly {
            // tamanuts.offset := 0
            tamanuts.length := 0
        }
        _settleOrder(0, data, 0, msg.sender, tamanuts);
    }

    function fillOrderInteraction(
        address taker,
        uint256, /* makingAmount */
        uint256 takingAmount,
        bytes calldata interactiveData
    ) external onlyThis(taker) onlyLimitOrderProtocol returns (uint256 result) {
        (
            bool finalInteraction,
            bytes calldata data,
            DynamicSuffix.Data calldata suffix,
            DynamicSuffix.TokenAndAmount[] calldata tamounts
        ) = _decodeSuffix(interactiveData);

        if (finalInteraction) {
            _chargeFee(suffix.resolver.get(), suffix.totalFee);
            (address target, bytes calldata cd) = _decodeTargetAndCalldata(data);
            IResolver(target).resolveOrders(suffix.resolver.get(), tamounts, cd);
        } else {
            _settleOrder(takingAmount, data, suffix.totalFee, suffix.resolver.get(), tamounts);
        }

        DynamicSuffix.TokenAndAmount calldata lastItem = tamounts[tamounts.length - 1];
        result = lastItem.amount;
        IERC20 token = IERC20(lastItem.token.get());
        if (suffix.takingFeeEnabled()) {
            token.safeTransfer(suffix.receiver.get(), result * suffix.takingFeeRatio() / DynamicSuffix._TAKING_FEE_BASE);
        }
        token.forceApprove(address(_limitOrderProtocol), result);
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
            if (block.timestamp > orderStartTime) {
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

    uint256 private constant _SUFFIX_LENGTH = 0x60; // DynamicSuffix._DATA_SIZE

    function _settleOrder(
        uint256 takingAmount,
        bytes calldata data,
        uint256 totalFee,
        address resolver,
        DynamicSuffix.TokenAndAmount[] calldata tamounts
    ) private {
        // Decoding order
        OrderLib.Order calldata order;
        assembly {
            order := add(data.offset, calldataload(add(data.offset, 0x04)))
        }
        if (!_checkResolver(resolver, order.interactions)) revert ResolverIsNotWhitelisted();
        address orderTakerAsset = order.takerAsset;
        uint256 orderTakerAmount = (takingAmount * _calculateRateBump(order.salt)) / _BASE_POINTS;
        totalFee += order.salt.getFee() * _ORDER_FEE_BASE_POINTS;
        Address feeReceiver = _extractFeeReceiver(order.interactions);

        // Decode taker interaction
        uint256 takerInteractionLengthPtr;
        uint256 takerInteractionOffset;
        uint256 takerInteractionLength;
        { // Stack too deep
            address takerInteractionTarget;
            assembly {
                takerInteractionLengthPtr := calldataload(add(data.offset, 0x40))
                takerInteractionOffset := add(takerInteractionLengthPtr, 0x20)
                takerInteractionLength := calldataload(add(data.offset, takerInteractionLengthPtr))
                takerInteractionTarget := shr(96, calldataload(add(data.offset, takerInteractionOffset)))
            }
            if (takerInteractionTarget != address(this)) revert WrongInteractionTarget();
        }

        // Copy calldata for fillOrderTo
        bytes4 selector = IOrderMixin.fillOrderTo.selector;
        IOrderMixin limitOrderProtocol = _limitOrderProtocol;
        assembly {
            // Copy calldata and patch interaction.length
            let ptr := mload(0x40)
            mstore(ptr, selector)

            let extraLength := add(add(_SUFFIX_LENGTH, mul(0x40, add(tamounts.length, 1))), 0x20)
            { // Stack too deep
                // Copy calldata and patch taker interaction length
                let offset := add(ptr, 4)
                calldatacopy(offset, data.offset, data.length)
                mstore(add(offset, takerInteractionLengthPtr), add(takerInteractionLength, extraLength))

                // Append dynamic suffix
                offset := add(add(offset, takerInteractionOffset), takerInteractionLength)
                mstore(offset, totalFee)
                mstore(add(offset, 0x20), resolver)
                mstore(add(offset, 0x40), feeReceiver)
                offset := add(offset, _SUFFIX_LENGTH)

                // Append tamounts and new one with length at the end
                calldatacopy(offset, tamounts.offset, mul(0x40, tamounts.length))
                offset := add(offset, mul(0x40, tamounts.length))
                mstore(offset, orderTakerAsset)
                mstore(add(offset, 0x20), orderTakerAmount)
                mstore(add(offset, 0x40), add(tamounts.length, 1))
            }

            if iszero(call(gas(), limitOrderProtocol, 0, ptr, add(add(4, data.length), extraLength), ptr, 0)) {
                returndatacopy(ptr, 0, returndatasize())
                revert(ptr, returndatasize())
            }
        }
    }

    // suffix of orderInteractions is constructed as follows:
    // [24 bytes * N, 1 byte, 4 bytes, optional[24 bytes], 1 byte]
    // [list[allowance ts + allowed resolver], list length N, public avaliability timestamp, optional[takerFeeData], takerFeeEnabled]

    function _checkResolver(address resolver, bytes calldata orderInteractions) private view returns(bool result) {
        assembly {
            let ptr := sub(add(orderInteractions.offset, orderInteractions.length), 1)
            let takerFeeEnabled := shr(255, calldataload(ptr))
            ptr := sub(ptr, add(4, mul(24, takerFeeEnabled)))
            let publicCutOff := shr(224, calldataload(ptr))
            switch gt(publicCutOff, timestamp())
            case 1 {
                ptr := sub(ptr, 1)
                let count := shr(248, calldataload(ptr))
                for { let end := sub(ptr, mul(count, 24)) } gt(ptr, end) { } {
                    ptr := sub(ptr, 20)
                    let account := shr(96, calldataload(ptr))
                    ptr := sub(ptr, 4)
                    let addressCutOff := shr(224, calldataload(ptr))
                    if eq(account, resolver) {
                        result := iszero(lt(timestamp(), addressCutOff))
                        break
                    }
                }
            }
            default {
                result := 1
            }
        }
    }

    function _extractFeeReceiver(bytes calldata orderInteractions) private pure returns (Address) {
        bool haveFee = false;
        uint32 feeRatio;
        address receiver;
        assembly {
            let ptr := sub(add(orderInteractions.offset, orderInteractions.length), 1)
            haveFee := shr(255, calldataload(ptr))
            feeRatio := shr(224, calldataload(sub(ptr, 24)))
            receiver := shr(96, calldataload(sub(ptr, 20)))
        }
        return DynamicSuffix.makeFeeReceiver(feeRatio, receiver);
    }

    function _decodeTargetAndCalldata(bytes calldata cd) private pure returns (address target, bytes calldata data) {
        assembly {
            target := shr(96, calldataload(cd.offset))
            data.offset := add(cd.offset, 20)
            data.length := sub(cd.length, 20)
        }
    }

    function _decodeSuffix(bytes calldata cd) private pure returns (
        bool finalInteraction,
        bytes calldata rest,
        DynamicSuffix.Data calldata suffix,
        DynamicSuffix.TokenAndAmount[] calldata tamanuts
    ) {
        uint256 finalizeInteraction = _FINALIZE_INTERACTION;
        assembly {
            let lengthOffset := sub(add(cd.offset, cd.length), 0x20)
            tamanuts.length := calldataload(lengthOffset)
            tamanuts.offset := sub(lengthOffset, mul(0x40, tamanuts.length))
            suffix := sub(tamanuts.offset, 0x60)

            finalInteraction := eq(finalizeInteraction, shr(248, calldataload(cd.offset)))
            rest.offset := add(cd.offset, 1)
            rest.length := sub(suffix, rest.offset)
        }
    }
}
