// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "../libraries/OrderSaltParser.sol";

contract OrderSaltParserTest {
    using OrderSaltParser for uint256;
    using OrderSaltParser for OrderSaltParser.OrderSalt;

    function init(uint256 orderSalt_) external pure returns (OrderSaltParser.OrderSalt memory) {
        return orderSalt_.init();
    }

    function create(uint32 startTime_, uint32 duration_, uint16 initialRate_, uint32 fee_, uint144 salt_) external pure returns (OrderSaltParser.OrderSalt memory) {
        return OrderSaltParser.create(startTime_, duration_, initialRate_, fee_, salt_);
    }

    function orderSalt(OrderSaltParser.OrderSalt memory self) external pure returns (uint256) {
        return self.orderSalt();
    }

    function onlyStartTime(uint256 orderSalt_) external pure returns (uint256) {
        return orderSalt_.onlyStartTime();
    }

    function onlyDuration(uint256 orderSalt_) external pure returns (uint256) {
        return orderSalt_.onlyDuration();
    }

    function onlyInitialRate(uint256 orderSalt_) external pure returns (uint256) {
        return orderSalt_.onlyInitialRate();
    }

    function onlyFee(uint256 orderSalt_) external pure returns (uint256) {
        return orderSalt_.onlyFee();
    }

    function onlySalt(uint256 orderSalt_) external pure returns (uint256) {
        return orderSalt_.onlySalt();
    }
}
