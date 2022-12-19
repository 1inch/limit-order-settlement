// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import "../interfaces/IResolver.sol";

contract ResolverMock is IResolver {
    error FailedExternalCall(uint256 index);

    function resolveOrders(
        address /* resolver */,
        bytes calldata /* items */,
        bytes calldata data
    ) external {
        if (data.length > 0) {
            (address[] memory targets, bytes[] memory calldatas) = abi.decode(data, (address[], bytes[]));
            for (uint256 i = 0; i < targets.length; i++) {
                // solhint-disable-next-line avoid-low-level-calls
                (bool success, ) = targets[i].call(calldatas[i]);
                if (!success) revert FailedExternalCall(i);
            }
        }
    }
}
