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
            IResolver(target).resolveOrders(data);
        } else {
            _settleOrder(
                interactiveData[1:interactiveData.length - DynamicSuffix._DATA_SIZE],
                suffix.resolver(),
                suffix.totalFee
            );
        }

        result = (takingAmount * _calculateRateBump(suffix.salt)) / _BASE_POINTS;
        suffix.token().forceApprove(address(_limitOrderProtocol), result);
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

    function _settleOrder(bytes calldata data, address resolver, uint256 totalFee) private {
        uint256 orderSalt;
        IERC20 orderToken;
        assembly {  // solhint-disable-line no-inline-assembly
            let orderOffset := add(data.offset, calldataload(data.offset))
            orderSalt := calldataload(orderOffset)
            orderToken := calldataload(add(orderOffset, 0x40))
        }
        totalFee += orderSalt.getFee() * _ORDER_FEE_BASE_POINTS;

        bytes4 selector = IOrderMixin.fillOrderTo.selector;
        uint256 suffixLength = DynamicSuffix._DATA_SIZE;
        IOrderMixin limitOrderProtocol = _limitOrderProtocol;
        assembly {  // solhint-disable-line no-inline-assembly
            let interactionLengthOffset := calldataload(add(data.offset, 0x40))
            let interactionOffset := add(interactionLengthOffset, 0x20)
            let interactionLength := calldataload(add(data.offset, interactionLengthOffset))

            // Copy calldata and patch interaction.length
            let ptr := mload(0x40)
            mstore(ptr, selector)
            calldatacopy(add(ptr, 4), data.offset, data.length)
            mstore(add(add(ptr, interactionLengthOffset), 4), add(interactionLength, suffixLength))

            // Append suffix fields
            let offset := add(add(ptr, interactionOffset), interactionLength)
            mstore(add(offset, 0x04), totalFee)
            mstore(add(offset, 0x24), resolver)
            mstore(add(offset, 0x44), orderToken)
            mstore(add(offset, 0x64), orderSalt)

            // Call fillOrderTo
            if iszero(call(gas(), limitOrderProtocol, 0, ptr, add(0x84, data.length), ptr, 0)) {
                returndatacopy(ptr, 0, returndatasize())
                revert(ptr, returndatasize())
            }
        }
    }

    function _decodeTargetAndCalldata(bytes calldata cd) private pure returns (address target, bytes calldata data) {
        assembly {  // solhint-disable-line no-inline-assembly
            target := shr(96, calldataload(cd.offset))
            data.offset := add(cd.offset, 20)
            data.length := sub(cd.length, 20)
        }
    }

    function _decodeSuffix(bytes calldata cd) private pure returns (DynamicSuffix.Data calldata suffix) {
        uint256 suffixSize = DynamicSuffix._DATA_SIZE;
        assembly {  // solhint-disable-line no-inline-assembly
            suffix := sub(add(cd.offset, cd.length), suffixSize)
        }
    }
}
