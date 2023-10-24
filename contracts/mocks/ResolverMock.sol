// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import "@openzeppelin/contracts/interfaces/IERC1271.sol";
import "../interfaces/IResolver.sol";
import "../interfaces/ISettlement.sol";
import "@1inch/solidity-utils/contracts/libraries/SafeERC20.sol";
import "@1inch/solidity-utils/contracts/libraries/ECDSA.sol";
import "@1inch/limit-order-protocol-contract/contracts/interfaces/IOrderMixin.sol";

contract ResolverMock is IResolver, IERC1271 {
    error OnlyOwner();
    error NotTaker();
    error OnlyLOP();
    error FailedExternalCall(uint256 index, bytes reason);

    using SafeERC20 for IERC20;
    using AddressLib for Address;

    bytes1 private constant _FINALIZE_INTERACTION = 0x01;
    uint256 private constant _RESOLVER_ADDRESS_BYTES_SIZE = 10;
    uint256 private constant _BASE_POINTS = 10_000_000; // 100%
    uint256 private constant _TAKING_FEE_BASE = 1e9;
    uint256 private constant _TAKING_FEE_RATIO_OFFSET = 160;


    address private immutable _settlementExtension;
    IOrderMixin private immutable _lopv4;
    address private immutable _owner;

    constructor(address settlementExtension, IOrderMixin limitOrderProtocol) {
        _settlementExtension = settlementExtension;
        _lopv4 = limitOrderProtocol;
        _owner = msg.sender;
    }

    function isValidSignature(bytes32 hash, bytes calldata signature) external view returns (bytes4 magicValue) {
        if (ECDSA.recoverOrIsValidSignature(_owner, hash, signature)) {
            return IERC1271.isValidSignature.selector;
        }
        return 0xFFFFFFFF;
    }

    function approve(IERC20 token, address to) external {
        if (msg.sender != _owner) revert OnlyOwner();
        token.forceApprove(to, type(uint256).max);
    }

    function settleOrders(bytes calldata data) public {
        if (msg.sender != _owner) revert OnlyOwner();
        _settleOrders(data);
    }

    function _settleOrders(bytes calldata data) internal {
        (bool success, bytes memory reason) = address(_lopv4).call(data); // abi.encodeWithSelector(_lopv4.fillOrderArgs.selector, data)
        if (!success) revert FailedExternalCall(0, reason);
    }

    // @dev High byte of `packing` contains number of permits, each 2 bits from lowest contains length of permit (index in [92,120,148] array)
    function settleOrdersWithPermits(bytes calldata data, uint256 packing, bytes calldata packedPermits) external {
        _performPermits(packing, packedPermits);
        settleOrders(data);
    }

    function takerInteraction(
        IOrderMixin.Order calldata /* order */,
        bytes calldata /* extension */,
        bytes32 /* orderHash */,
        address taker,
        uint256 /* makingAmount */,
        uint256 /* takingAmount */,
        uint256 /* remainingMakingAmount */,
        bytes calldata extraData
    ) public {
        if (msg.sender != address(_lopv4)) revert OnlyLOP();
        if (taker != address(this)) revert NotTaker();

        unchecked {
            if (extraData[0] == _FINALIZE_INTERACTION) {
                if (extraData.length > 1) {
                    (Address[] memory targets, bytes[] memory calldatas) = abi.decode(extraData[1:], (Address[], bytes[]));
                    for (uint256 i = 0; i < targets.length; ++i) {
                        // solhint-disable-next-line avoid-low-level-calls
                        (bool success, bytes memory reason) = targets[i].get().call(calldatas[i]);
                        if (!success) revert FailedExternalCall(i, reason);
                    }
                }
            } else {
                // _lopv4.call(abi.encodeWithSelector(extraData[1:4], args[5:]));
                _settleOrders(extraData[1:]);
            }
        }
    }

    function _performPermits(uint256 packing, bytes calldata packedPermits) private {
        unchecked {
            uint256 permitsCount = packing >> 248;
            uint256 start = 0;
            for (uint256 i = 0; i < permitsCount; i++) {
                uint256 length = (packing >> (i << 1)) & 0x03;
                if (length == 0) length = 112;
                else if (length == 1) length = 140;
                else if (length == 2) length = 136;

                bytes calldata permit = packedPermits[start:start + length];
                address owner = address(bytes20(permit));
                IERC20 token = IERC20(address(bytes20(permit[20:])));
                token.safePermit(owner, address(_lopv4), permit[40:]);
                start += length;
            }
        }
    }
}
