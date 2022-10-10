// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

/// @title Library for parsing parameters from salt.
library OrderSaltParser {
    uint256 private constant _ORDER_TIME_START_MASK     = 0xFFFFFFFF00000000000000000000000000000000000000000000000000000000; // prettier-ignore
    uint256 private constant _ORDER_DURATION_MASK       = 0x00000000FFFFFFFF000000000000000000000000000000000000000000000000; // prettier-ignore
    uint256 private constant _ORDER_INITIAL_RATE_MASK   = 0x0000000000000000FFFF00000000000000000000000000000000000000000000; // prettier-ignore
    uint256 private constant _ORDER_FEE_MASK            = 0x00000000000000000000FFFFFFFF000000000000000000000000000000000000; // prettier-ignore
    uint256 private constant _ORDER_SALT_MASK           = 0x0000000000000000000000000000FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF; // prettier-ignore

    uint256 private constant _ORDER_TIME_START_SHIFT    = 224; // orderTimeMask 224-255
    uint256 private constant _ORDER_DURATION_SHIFT      = 192; // durationMask 192-223
    uint256 private constant _ORDER_INITIAL_RATE_SHIFT  = 176; // initialRateMask 176-191
    uint256 private constant _ORDER_FEE_SHIFT           = 144; // orderFee 144-175

    struct OrderSalt {
        uint32 startTime;
        uint32 duration;
        uint16 initialRate;
        uint32 fee;
        uint144 salt;
    }

    function init(uint256 orderSalt_) internal pure returns (OrderSalt memory) {
        return OrderSalt(
            uint32(orderSalt_ >> _ORDER_TIME_START_SHIFT),
            uint32(orderSalt_ >> _ORDER_DURATION_SHIFT),
            uint16(orderSalt_ >> _ORDER_INITIAL_RATE_SHIFT),
            uint32(orderSalt_ >> _ORDER_FEE_SHIFT),
            uint144(orderSalt_)
        );
    }

    function init(uint32 startTime_, uint32 duration_, uint16 initialRate_, uint32 fee_, uint144 salt_) internal pure returns (OrderSalt memory) {
        return OrderSalt(startTime_, duration_, initialRate_, fee_, salt_);
    }

    function orderSalt(OrderSalt memory self) internal pure returns (uint256) {
        return (uint256(self.startTime) << _ORDER_TIME_START_SHIFT) +
                (uint256(self.duration) << _ORDER_DURATION_SHIFT) +
                (uint256(self.initialRate) << _ORDER_INITIAL_RATE_SHIFT) +
                (uint256(self.fee) << _ORDER_FEE_SHIFT) +
                self.salt;
    }

    function onlyStartTime(uint256 orderSalt_) internal pure returns (uint256) {
        return (orderSalt_ & _ORDER_TIME_START_MASK) >> _ORDER_TIME_START_SHIFT;
    }

    function onlyDuration(uint256 orderSalt_) internal pure returns (uint256) {
        return (orderSalt_ & _ORDER_DURATION_MASK) >> _ORDER_DURATION_SHIFT;
    }

    function onlyInitialRate(uint256 orderSalt_) internal pure returns (uint256) {
        return (orderSalt_ & _ORDER_INITIAL_RATE_MASK) >> _ORDER_INITIAL_RATE_SHIFT;
    }

    function onlyFee(uint256 orderSalt_) internal pure returns (uint256) {
        return (orderSalt_ & _ORDER_FEE_MASK) >> _ORDER_FEE_SHIFT;
    }

    function onlySalt(uint256 orderSalt_) internal pure returns (uint256) {
        return orderSalt_ & _ORDER_SALT_MASK;
    }
}
