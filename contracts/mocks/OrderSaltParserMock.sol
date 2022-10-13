// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import "../libraries/OrderSaltParser.sol";

contract OrderSaltParserMock {
    using OrderSaltParser for uint256;

    function getStartTime(uint256 orderSalt_) external pure returns (uint256) {
        return orderSalt_.getStartTime();
    }

    function getDuration(uint256 orderSalt_) external pure returns (uint256) {
        return orderSalt_.getDuration();
    }

    function getInitialRateBump(uint256 orderSalt_) external pure returns (uint256) {
        return orderSalt_.getInitialRateBump();
    }

    function getFee(uint256 orderSalt_) external pure returns (uint256) {
        return orderSalt_.getFee();
    }

    function getSalt(uint256 orderSalt_) external pure returns (uint256) {
        return orderSalt_.getSalt();
    }
}
