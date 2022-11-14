// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@1inch/limit-order-protocol/contracts/interfaces/NotificationReceiver.sol";
import "@1inch/limit-order-protocol/contracts/interfaces/IOrderMixin.sol";
import "@1inch/solidity-utils/contracts/libraries/SafeERC20.sol";
import "./libraries/OrderSaltParser.sol";
import "./interfaces/IWhitelistRegistry.sol";
import "./interfaces/ISettlement.sol";
import "./interfaces/IResolver.sol";
import "./interfaces/IWhitelistRegistry.sol";
import "./FeeBankCharger.sol";

import "hardhat/console.sol";

library DynamicSuffix {
    struct Data {
        uint256 totalFee;
        uint256 _resolver;
        uint256 _token;
        uint256 salt;
    }

    uint256 internal constant _DATA_SIZE = 0x80;

    function resolver(Data calldata self) internal pure returns (address) {
        return address(uint160(self._resolver));
    }

    function token(Data calldata self) internal pure returns (IERC20) {
        return IERC20(address(uint160(self._token)));
    }
}

contract Settlement is ISettlement, Ownable, FeeBankCharger {
    using SafeERC20 for IERC20;
    using OrderSaltParser for uint256;
    using DynamicSuffix for DynamicSuffix.Data;

    error AccessDenied();
    error IncorrectCalldataParams();
    error FailedExternalCall();

    bytes1 private constant _FINALIZE_INTERACTION = 0x01;
    uint256 private constant _ORDER_FEE_BASE_POINTS = 1e15;
    uint16 private constant _BASE_POINTS = 10000; // 100%
    uint16 private constant _DEFAULT_INITIAL_RATE_BUMP = 1000; // 10%
    uint32 private constant _DEFAULT_DURATION = 30 minutes;

    IWhitelistRegistry private immutable _whitelist;
    IOrderMixin private immutable _limitOrderProtocol;

    modifier onlyWhitelisted(address account) {
        if (!_whitelist.isWhitelisted(account)) revert AccessDenied();
        _;
    }

    modifier onlyThis(address account) {
        if (account != address(this)) revert AccessDenied();
        _;
    }

    modifier onlyLimitOrderProtocol {
        if (msg.sender != address(_limitOrderProtocol)) revert AccessDenied();
        _;
    }

    constructor(IWhitelistRegistry whitelist, IOrderMixin limitOrderProtocol, IERC20 token)
        FeeBankCharger(token)
    {
        _whitelist = whitelist;
        _limitOrderProtocol = limitOrderProtocol;
    }

    function settleOrders(
        OrderLib.Order calldata order,
        bytes calldata signature,
        bytes calldata interaction,
        uint256 makingAmount,
        uint256 takingAmount,
        uint256 thresholdAmount,
        address target
    ) external onlyWhitelisted(msg.sender) {
        _settleOrder(
            order,
            msg.sender,
            0,
            signature,
            interaction,
            makingAmount,
            takingAmount,
            thresholdAmount,
            target
        );
    }

    function fillOrderInteraction(
        address taker,
        uint256, /* makingAmount */
        uint256 takingAmount,
        bytes calldata interactiveData
    ) external onlyThis(taker) onlyLimitOrderProtocol returns (uint256 result) {
        DynamicSuffix.Data calldata suffix = _abiDecodeResolverTokenSaltFromTail(interactiveData);

        if (interactiveData[0] == _FINALIZE_INTERACTION) {
            _chargeFee(suffix.resolver(), suffix.totalFee);
            (address target, bytes calldata data) = _abiDecodeTargetAndCalldata(interactiveData[1:interactiveData.length - DynamicSuffix._DATA_SIZE]);
            IResolver(target).resolveOrders(data);
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
                order,
                suffix.resolver(),
                suffix.totalFee,
                signature,
                interaction,
                makingOrderAmount,
                takingOrderAmount,
                thresholdAmount,
                target
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

    function _settleOrder(
        OrderLib.Order calldata order,
        address resolver,
        uint256 totalFee,
        bytes calldata signature,
        bytes calldata interaction,
        uint256 makingAmount,
        uint256 takingAmount,
        uint256 thresholdAmount,
        address target
    ) private {
        OrderLib.Order calldata order2 = order;
        totalFee += order.salt.getFee() * _ORDER_FEE_BASE_POINTS;

        bytes memory patchedInteraction = abi.encodePacked(
            interaction,
            totalFee,
            uint256(uint160(resolver)),
            uint256(uint160(order2.takerAsset)),
            order2.salt
        );
        _limitOrderProtocol.fillOrderTo(
            order2,
            signature,
            patchedInteraction,
            makingAmount,
            takingAmount,
            thresholdAmount,
            target
        );
    }

    function _abiDecodeTargetAndCalldata(bytes calldata cd) private pure returns (address target, bytes calldata data) {
        assembly {  // solhint-disable-line no-inline-assembly
            target := shr(96, calldataload(cd.offset))
            data.offset := add(cd.offset, 20)
            data.length := sub(cd.length, 20)
        }
    }

    function _abiDecodeResolverTokenSaltFromTail(bytes calldata cd) private pure returns (DynamicSuffix.Data calldata suffix) {
        uint256 suffixSize = DynamicSuffix._DATA_SIZE;
        assembly {  // solhint-disable-line no-inline-assembly
            suffix := sub(add(cd.offset, cd.length), suffixSize)
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
