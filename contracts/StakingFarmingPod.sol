// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import "@1inch/farming/contracts/FarmingPod.sol";
import "@1inch/farming/contracts/FarmingLib.sol";
import "./interfaces/ISt1inch.sol";

contract StakingFarmingPod is FarmingPod {
    using SafeERC20 for IERC20;
    using FarmingLib for FarmingLib.Info;

    ISt1inch public immutable st1inch;

    constructor(ISt1inch st1inch_) FarmingPod(st1inch_, st1inch_.oneInch()) {
        st1inch = st1inch_;
    }

    function claim() external override {
        uint256 podBalance = st1inch.podBalanceOf(address(this), msg.sender);
        uint256 amount = _farmInfo().claim(msg.sender, podBalance);
        if (amount > 0) {
            if (st1inch.emergencyExit()) {
                st1inch.oneInch().safeTransfer(msg.sender, amount);
            } else {
                st1inch.depositFor(msg.sender, amount);
            }
        }
    }
}
