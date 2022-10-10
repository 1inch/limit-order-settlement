// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;
pragma abicoder v1;

import "@1inch/solidity-utils/contracts/mocks/TokenMock.sol";

contract VotingPowerCalculatorMock is TokenMock {
    uint256 public immutable origin;
    uint256 public immutable expBase;

    constructor(string memory name, string memory symbol) TokenMock(name, symbol) {
        // solhint-disable-next-line not-rely-on-time
        origin = block.timestamp;
        expBase = 0;
    }
}
