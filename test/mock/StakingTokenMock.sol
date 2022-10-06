// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;
pragma abicoder v1;

import "@1inch/solidity-utils/contracts/mocks/TokenMock.sol";

contract StakingTokenMock is TokenMock {
    // solhint-disable-next-line no-empty-blocks
    constructor(string memory name, string memory symbol) TokenMock(name, symbol) {}

    function votingPowerOf(address account) external view returns (uint256) {
        return balanceOf(account) / 2;
    }
}
