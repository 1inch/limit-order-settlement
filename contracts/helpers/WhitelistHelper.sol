// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import "../WhitelistRegistry.sol";

contract WhitelistHelper {
    WhitelistRegistry public immutable whitelistRegistry;
    IERC20 public immutable delegation;

    constructor(WhitelistRegistry whitelistRegistry_) {
        whitelistRegistry = whitelistRegistry_;
        delegation = IERC20(whitelistRegistry.token());
    }

    function getMinAmountForWhitelisted() external view returns (uint256) {
        address [] memory whitelist = whitelistRegistry.getWhitelist();
        uint256 whitelistLength = whitelist.length;

        if (whitelistLength == 0)
            return whitelistRegistry.resolverThreshold();

        uint256 minBalance = delegation.balanceOf(whitelist[0]);
        for (uint256 i = 1; i < whitelistLength; ++i) {
            uint256 balance = delegation.balanceOf(whitelist[i]);
            if (balance < minBalance)
                minBalance = balance;
        }
        return minBalance + 1;
    }
}
