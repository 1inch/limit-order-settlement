// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "../St1inch.sol";

contract St1inchMock is St1inch {
    constructor(IERC20 oneInch_, uint256 expBase_, address feeReceiver_)
        St1inch(oneInch_, expBase_, feeReceiver_)
    {}

    function mint(address account, uint256 amount) external {
        _mint(account, amount);
    }
}
