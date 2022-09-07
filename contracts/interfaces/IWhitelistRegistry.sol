// SPDX-License-Identifier: MIT

pragma solidity 0.8.15;
pragma abicoder v1;

interface IWhitelistRegistry {
    enum Status {
        Unverified,
        Verified
    }

    function status(address addr) external view returns (uint256);
}
