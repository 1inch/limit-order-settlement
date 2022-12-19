// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import "../interfaces/IResolver.sol";
import "../libraries/TokensAndAmounts.sol";
import "@1inch/solidity-utils/contracts/libraries/SafeERC20.sol";

contract ResolverMock is IResolver {
    error FailedExternalCall(uint256 index, bytes reason);

    using TokensAndAmounts for bytes;
    using SafeERC20 for IERC20;
    using AddressLib for Address;

    function resolveOrders(
        address /* resolver */,
        bytes calldata tokensAndAmounts,
        bytes calldata data
    ) external {
        if (data.length > 0) {
            (address[] memory targets, bytes[] memory calldatas) = abi.decode(data, (address[], bytes[]));
            for (uint256 i = 0; i < targets.length; i++) {
                // solhint-disable-next-line avoid-low-level-calls
                (bool success, bytes memory reason) = targets[i].call(calldatas[i]);
                if (!success) revert FailedExternalCall(i, reason);
            }
        }
        TokensAndAmounts.Data[] calldata items = tokensAndAmounts.decode();
        for (uint256 i = 0; i < items.length; i++) {
            IERC20(items[i].token.get()).safeTransfer(msg.sender, items[i].amount);
        }
    }
}
