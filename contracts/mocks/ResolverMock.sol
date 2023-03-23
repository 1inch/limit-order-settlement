// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import "../interfaces/IResolver.sol";
import "../interfaces/ISettlement.sol";
import "../libraries/TokensAndAmounts.sol";
import "@1inch/solidity-utils/contracts/libraries/SafeERC20.sol";

contract ResolverMock is IResolver {
    error OnlyOwner();
    error OnlySettlement();
    error FailedExternalCall(uint256 index, bytes reason);

    using TokensAndAmounts for bytes;
    using SafeERC20 for IERC20;
    using AddressLib for Address;

    ISettlement private immutable _settlement;
    address private immutable _limitOrderProtocol;
    address private immutable _owner;

    constructor(ISettlement settlement, address limitOrderProtocol) {
        _settlement = settlement;
        _limitOrderProtocol = limitOrderProtocol;
        _owner = msg.sender;
    }

    function settleOrders(bytes calldata data) public {
        if (msg.sender != _owner) revert OnlyOwner();
        _settlement.settleOrders(data);
    }

    /// @dev High byte of `packing` contains number of permits, each 2 bits from lowest contains length of permit (index in [92,120,148] array)
    function settleOrdersWithPermits(bytes calldata data, uint256 packing, bytes calldata packedPermits) external {
        _performPermits(packing, packedPermits);
        settleOrders(data);
    }

    function resolveOrders(bytes calldata tokensAndAmounts, bytes calldata data) external returns(bool) {
        if (msg.sender != address(_settlement)) revert OnlySettlement();

        if (data.length > 0) {
            (Address[] memory targets, bytes[] memory calldatas) = abi.decode(data, (Address[], bytes[]));
            for (uint256 i = 0; i < targets.length; ++i) {
                // solhint-disable-next-line avoid-low-level-calls
                (bool success, bytes memory reason) = targets[i].get().call(calldatas[i]);
                if (!success) revert FailedExternalCall(i, reason);
            }
        }

        TokensAndAmounts.Data[] calldata items = tokensAndAmounts.decode();
        for (uint256 i = 0; i < items.length; i++) {
            IERC20(items[i].token.get()).safeTransfer(msg.sender, items[i].amount);
        }

        return true;
    }

    function _performPermits(uint256 packing, bytes calldata packedPermits) private {
        unchecked {
            uint256 permitsCount = packing >> 248;
            uint256 start = 0;
            for (uint256 i = 0; i < permitsCount; i++) {
                uint256 length = (packing >> (i << 1)) & 0x03;
                if (length == 0) length = 112;
                else if (length == 1) length = 140;
                else if (length == 2) length = 168;

                bytes calldata permit = packedPermits[start:start + length];
                address owner = address(bytes20(permit));
                IERC20 token = IERC20(address(bytes20(permit[20:])));
                token.safePermit(owner, _limitOrderProtocol, permit[40:]);
                start += length;
            }
        }
    }
}
