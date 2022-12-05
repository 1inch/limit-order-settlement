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
    using OrderSaltParser for uint256;
    using DynamicSuffix for DynamicSuffix.Data;

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
        DynamicSuffix.Data calldata suffix = _decodeSuffix(interactiveData);

        if (interactiveData[0] == _FINALIZE_INTERACTION) {
            _chargeFee(suffix.resolver(), suffix.totalFee);
            (address target, bytes calldata data) = _decodeTargetAndCalldata(interactiveData[1:interactiveData.length - DynamicSuffix._DATA_SIZE]);
            IResolver(target).resolveOrders(suffix.resolver(), data);
        } else {
            _settleOrder(
                interactiveData[1:interactiveData.length - DynamicSuffix._DATA_SIZE],
                suffix.resolver(),
                suffix.totalFee
            );
        }

        result = (takingAmount * _calculateRateBump(suffix.salt)) / _BASE_POINTS;
        IERC20 token = suffix.token();
        if (suffix.takingFeeEnabled()) {
            token.transfer(suffix.takingFeeReceiver(), result * suffix.takingFeeRatio() / DynamicSuffix._TAKING_FEE_BASE);
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

    function _settleOrder(bytes calldata data, address resolver, uint256 totalFee) private {
        IERC20 orderToken;
        uint256 orderSalt;
        uint256 takingFeeData;
        {  // stack too deep
            bytes calldata orderInteractions;
            assembly {
                let orderOffset := add(data.offset, calldataload(data.offset))
                orderSalt := calldataload(orderOffset)
                orderToken := calldataload(add(orderOffset, 0x40))

                orderInteractions.offset := add(orderOffset, calldataload(add(orderOffset, 0x120)))
                orderInteractions.length := calldataload(orderInteractions.offset)
                orderInteractions.offset := add(orderInteractions.offset, 0x20)
            }
            totalFee += orderSalt.getFee() * _ORDER_FEE_BASE_POINTS;
            if (!_checkResolver(resolver, orderInteractions)) revert ResolverIsNotWhitelisted();
            takingFeeData = _extractTakingFeeData(orderInteractions);
        }

        bytes4 selector = IOrderMixin.fillOrderTo.selector;
        bytes4 errorSelector = WrongInteractionTarget.selector;
        uint256 suffixLength = DynamicSuffix._DATA_SIZE;
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
                mstore(add(offset, 0x44), orderToken)
                mstore(add(offset, 0x64), orderSalt)
                mstore(add(offset, 0x84), takingFeeData)
            }

            // Call fillOrderTo
            if iszero(call(gas(), limitOrderProtocol, 0, ptr, add(add(4, suffixLength), data.length), ptr, 0)) {
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
                ptr := sub(ptr, 20)
                for { let end := sub(ptr, mul(count, 20)) } gt(ptr, end) { ptr := sub(ptr, 20) } {
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

    function _extractTakingFeeData(bytes calldata orderInteractions) private pure returns (uint256 feeData) {
        assembly {
            let ptr := sub(add(orderInteractions.offset, orderInteractions.length), 1)
            let takerFeeEnabled := shr(255, calldataload(ptr))
            if eq(takerFeeEnabled, 1) {
                feeData := shr(96, calldataload(sub(ptr, 24)))
                feeData := or(feeData, shl(255, 1)) // set the highest bit to indicate that takerFee is enabled
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

    function _decodeSuffix(bytes calldata cd) private pure returns (DynamicSuffix.Data calldata suffix) {
        uint256 suffixSize = DynamicSuffix._DATA_SIZE;
        assembly {
            suffix := sub(add(cd.offset, cd.length), suffixSize)
        }
    }
}
