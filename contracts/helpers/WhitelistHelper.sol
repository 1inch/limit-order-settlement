// SPDX-License-Identifier: MIT

pragma solidity 0.8.20;

import "../WhitelistRegistry.sol";

/// @title WhitelistHelper
/// @notice The contract provides a helper method for retrieving the minimum amount required for a resolver to be whitelisted.
contract WhitelistHelper {
    WhitelistRegistry public immutable whitelistRegistry;
    IERC20 public immutable delegation;

    constructor(WhitelistRegistry whitelistRegistry_) {
        whitelistRegistry = whitelistRegistry_;
        delegation = IERC20(whitelistRegistry.token());
    }

    /**
     * @notice Retrieves the minimum amount required for a delegatee to be whitelisted.
     * @dev If the whitelist is not full, this is the set the minimum allowed value, which is required to enter.
     * If the whitelist is full, this is one more wei more than the balance of the resolver with the smallest balance,
     * who is currently whitelisted.
     * @return The minimum amount required for a delegatee to be whitelisted.
     */
    function getMinAmountForWhitelisted() external view returns (uint256) {
        address [] memory whitelist = whitelistRegistry.getWhitelist();
        uint256 whitelistLength = whitelist.length;
        uint256 threshold = whitelistRegistry.resolverThreshold();

        if (whitelistLength < whitelistRegistry.whitelistLimit()) {
            return threshold;
        }

        uint256 minBalance = delegation.balanceOf(whitelist[0]);
        for (uint256 i = 1; i < whitelistLength; ++i) {
            uint256 balance = delegation.balanceOf(whitelist[i]);
            if (balance < minBalance) {
                minBalance = balance;
            }
        }
        if (minBalance < threshold) {
            return threshold;
        }
        return minBalance + 1;
    }
}
