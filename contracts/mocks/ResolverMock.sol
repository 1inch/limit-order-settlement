// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import "../interfaces/IResolver.sol";
import "../libraries/TokensAndAmounts.sol";
import "@1inch/solidity-utils/contracts/libraries/SafeERC20.sol";

contract ResolverMock is IResolver {
    error OnlyOwner();
    error OnlySettlement();
    error FailedExternalCall(uint256 index, bytes reason);

    using TokensAndAmounts for bytes;
    using SafeERC20 for IERC20;
    using AddressLib for Address;

    address private immutable _settlement;
    address private immutable _owner;

    constructor(address settlement) {
        _settlement = settlement;
        _owner = msg.sender;
    }

    function resolveOrders(bytes calldata tokensAndAmounts, bytes calldata data) external {
        if (msg.sender != _settlement) revert OnlySettlement();

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
    }
}
