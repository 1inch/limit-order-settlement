// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import "../interfaces/IResolver.sol";
import "../libraries/TokensAndAmounts.sol";
import "@1inch/solidity-utils/contracts/libraries/SafeERC20.sol";

contract ResolverMock is IResolver {
    error OnlySettlement();
    error FailedExternalCall(uint256 index, bytes reason);

    using TokensAndAmounts for bytes;
    using SafeERC20 for IERC20;
    using AddressLib for Address;

    address private immutable _settlement;

    constructor(address settlement) {
        _settlement = settlement;
    }

    function resolveOrders(
        address /* resolver */,
        bytes calldata tokensAndAmounts,
        bytes calldata data
    ) external {
        if (msg.sender != _settlement) revert OnlySettlement();
        // if (resolver != owner()) revert OnlyOwner();

        bytes32 tokenIndices = bytes32(data);
        if (data.length > 32) {
            (address[] memory targets, bytes[] memory calldatas) = abi.decode(data[32:], (address[],bytes[]));
            for (uint256 i = 0; i < targets.length; i++) {
                // solhint-disable-next-line avoid-low-level-calls
                (bool success, bytes memory reason) = targets[i].call(calldatas[i]);
                if (!success) revert FailedExternalCall(i, reason);
            }
        }

        unchecked {
            TokensAndAmounts.Data[] calldata items = tokensAndAmounts.decode();
            for (uint256 i = 0; i < items.length; i++) {
                uint256 totalAmount = items[i].amount;
                for (uint256 j = uint8(tokenIndices[i]); j != 0; j = uint8(tokenIndices[j])) {
                    if (j == 0xff) {
                        totalAmount = 0;
                        break;
                    }
                    totalAmount += items[j].amount;
                    tokenIndices |= bytes32(uint256(0xff) << (j << 3));
                }

                if (totalAmount > 0) {
                    IERC20(items[i].token.get()).safeTransfer(msg.sender, totalAmount);
                }
            }
        }
    }
}
