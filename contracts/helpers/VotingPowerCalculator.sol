// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

contract VotingPowerCalculator {
    uint256 private immutable origin;
    uint256 private immutable expTable0;
    uint256 private immutable expTable1;
    uint256 private immutable expTable2;
    uint256 private immutable expTable3;
    uint256 private immutable expTable4;
    uint256 private immutable expTable5;
    uint256 private immutable expTable6;
    uint256 private immutable expTable7;
    uint256 private immutable expTable8;
    uint256 private immutable expTable9;
    uint256 private immutable expTable10;
    uint256 private immutable expTable11;
    uint256 private immutable expTable12;
    uint256 private immutable expTable13;
    uint256 private immutable expTable14;
    uint256 private immutable expTable15;
    uint256 private immutable expTable16;
    uint256 private immutable expTable17;
    uint256 private immutable expTable18;
    uint256 private immutable expTable19;
    uint256 private immutable expTable20;
    uint256 private immutable expTable21;
    uint256 private immutable expTable22;
    uint256 private immutable expTable23;
    uint256 private immutable expTable24;
    uint256 private immutable expTable25;
    uint256 private immutable expTable26;
    uint256 private immutable expTable27;
    uint256 private immutable expTable28;
    uint256 private immutable expTable29;

    constructor(uint256 expBase_, uint256 origin_) {
        origin = origin_;
        expTable0 = expBase_;
        expTable1 = (expTable0 * expTable0) / 1e18;
        expTable2 = (expTable1 * expTable1) / 1e18;
        expTable3 = (expTable2 * expTable2) / 1e18;
        expTable4 = (expTable3 * expTable3) / 1e18;
        expTable5 = (expTable4 * expTable4) / 1e18;
        expTable6 = (expTable5 * expTable5) / 1e18;
        expTable7 = (expTable6 * expTable6) / 1e18;
        expTable8 = (expTable7 * expTable7) / 1e18;
        expTable9 = (expTable8 * expTable8) / 1e18;
        expTable10 = (expTable9 * expTable9) / 1e18;
        expTable11 = (expTable10 * expTable10) / 1e18;
        expTable12 = (expTable11 * expTable11) / 1e18;
        expTable13 = (expTable12 * expTable12) / 1e18;
        expTable14 = (expTable13 * expTable13) / 1e18;
        expTable15 = (expTable14 * expTable14) / 1e18;
        expTable16 = (expTable15 * expTable15) / 1e18;
        expTable17 = (expTable16 * expTable16) / 1e18;
        expTable18 = (expTable17 * expTable17) / 1e18;
        expTable19 = (expTable18 * expTable18) / 1e18;
        expTable20 = (expTable19 * expTable19) / 1e18;
        expTable21 = (expTable20 * expTable20) / 1e18;
        expTable22 = (expTable21 * expTable21) / 1e18;
        expTable23 = (expTable22 * expTable22) / 1e18;
        expTable24 = (expTable23 * expTable23) / 1e18;
        expTable25 = (expTable24 * expTable24) / 1e18;
        expTable26 = (expTable25 * expTable25) / 1e18;
        expTable27 = (expTable26 * expTable26) / 1e18;
        expTable28 = (expTable27 * expTable27) / 1e18;
        expTable29 = (expTable28 * expTable28) / 1e18;
    }

    function _votingPowerAt(uint256 balance, uint256 timestamp) internal view returns (uint256 votingPower) {
        unchecked {
            uint256 t = timestamp - origin;
            votingPower = balance;
            if (t & 0x01 != 0) {
                votingPower = (votingPower * expTable0) / 1e18;
            }
            if (t & 0x02 != 0) {
                votingPower = (votingPower * expTable1) / 1e18;
            }
            if (t & 0x04 != 0) {
                votingPower = (votingPower * expTable2) / 1e18;
            }
            if (t & 0x08 != 0) {
                votingPower = (votingPower * expTable3) / 1e18;
            }
            if (t & 0x10 != 0) {
                votingPower = (votingPower * expTable4) / 1e18;
            }
            if (t & 0x20 != 0) {
                votingPower = (votingPower * expTable5) / 1e18;
            }
            if (t & 0x40 != 0) {
                votingPower = (votingPower * expTable6) / 1e18;
            }
            if (t & 0x80 != 0) {
                votingPower = (votingPower * expTable7) / 1e18;
            }
            if (t & 0x100 != 0) {
                votingPower = (votingPower * expTable8) / 1e18;
            }
            if (t & 0x200 != 0) {
                votingPower = (votingPower * expTable9) / 1e18;
            }
            if (t & 0x400 != 0) {
                votingPower = (votingPower * expTable10) / 1e18;
            }
            if (t & 0x800 != 0) {
                votingPower = (votingPower * expTable11) / 1e18;
            }
            if (t & 0x1000 != 0) {
                votingPower = (votingPower * expTable12) / 1e18;
            }
            if (t & 0x2000 != 0) {
                votingPower = (votingPower * expTable13) / 1e18;
            }
            if (t & 0x4000 != 0) {
                votingPower = (votingPower * expTable14) / 1e18;
            }
            if (t & 0x8000 != 0) {
                votingPower = (votingPower * expTable15) / 1e18;
            }
            if (t & 0x10000 != 0) {
                votingPower = (votingPower * expTable16) / 1e18;
            }
            if (t & 0x20000 != 0) {
                votingPower = (votingPower * expTable17) / 1e18;
            }
            if (t & 0x40000 != 0) {
                votingPower = (votingPower * expTable18) / 1e18;
            }
            if (t & 0x80000 != 0) {
                votingPower = (votingPower * expTable19) / 1e18;
            }
            if (t & 0x100000 != 0) {
                votingPower = (votingPower * expTable20) / 1e18;
            }
            if (t & 0x200000 != 0) {
                votingPower = (votingPower * expTable21) / 1e18;
            }
            if (t & 0x400000 != 0) {
                votingPower = (votingPower * expTable22) / 1e18;
            }
            if (t & 0x800000 != 0) {
                votingPower = (votingPower * expTable23) / 1e18;
            }
            if (t & 0x1000000 != 0) {
                votingPower = (votingPower * expTable24) / 1e18;
            }
            if (t & 0x2000000 != 0) {
                votingPower = (votingPower * expTable25) / 1e18;
            }
            if (t & 0x4000000 != 0) {
                votingPower = (votingPower * expTable26) / 1e18;
            }
            if (t & 0x8000000 != 0) {
                votingPower = (votingPower * expTable27) / 1e18;
            }
            if (t & 0x10000000 != 0) {
                votingPower = (votingPower * expTable28) / 1e18;
            }
            if (t & 0x20000000 != 0) {
                votingPower = (votingPower * expTable29) / 1e18;
            }
        }
        return votingPower;
    }

    function _balanceAt(uint256 votingPower, uint256 timestamp) internal view returns (uint256 balance) {
        unchecked {
            uint256 t = timestamp - origin;
            balance = votingPower;
            if (t & 0x01 != 0) {
                balance = (balance * 1e18) / expTable0;
            }
            if (t & 0x02 != 0) {
                balance = (balance * 1e18) / expTable1;
            }
            if (t & 0x04 != 0) {
                balance = (balance * 1e18) / expTable2;
            }
            if (t & 0x08 != 0) {
                balance = (balance * 1e18) / expTable3;
            }
            if (t & 0x10 != 0) {
                balance = (balance * 1e18) / expTable4;
            }
            if (t & 0x20 != 0) {
                balance = (balance * 1e18) / expTable5;
            }
            if (t & 0x40 != 0) {
                balance = (balance * 1e18) / expTable6;
            }
            if (t & 0x80 != 0) {
                balance = (balance * 1e18) / expTable7;
            }
            if (t & 0x100 != 0) {
                balance = (balance * 1e18) / expTable8;
            }
            if (t & 0x200 != 0) {
                balance = (balance * 1e18) / expTable9;
            }
            if (t & 0x400 != 0) {
                balance = (balance * 1e18) / expTable10;
            }
            if (t & 0x800 != 0) {
                balance = (balance * 1e18) / expTable11;
            }
            if (t & 0x1000 != 0) {
                balance = (balance * 1e18) / expTable12;
            }
            if (t & 0x2000 != 0) {
                balance = (balance * 1e18) / expTable13;
            }
            if (t & 0x4000 != 0) {
                balance = (balance * 1e18) / expTable14;
            }
            if (t & 0x8000 != 0) {
                balance = (balance * 1e18) / expTable15;
            }
            if (t & 0x10000 != 0) {
                balance = (balance * 1e18) / expTable16;
            }
            if (t & 0x20000 != 0) {
                balance = (balance * 1e18) / expTable17;
            }
            if (t & 0x40000 != 0) {
                balance = (balance * 1e18) / expTable18;
            }
            if (t & 0x80000 != 0) {
                balance = (balance * 1e18) / expTable19;
            }
            if (t & 0x100000 != 0) {
                balance = (balance * 1e18) / expTable20;
            }
            if (t & 0x200000 != 0) {
                balance = (balance * 1e18) / expTable21;
            }
            if (t & 0x400000 != 0) {
                balance = (balance * 1e18) / expTable22;
            }
            if (t & 0x800000 != 0) {
                balance = (balance * 1e18) / expTable23;
            }
            if (t & 0x1000000 != 0) {
                balance = (balance * 1e18) / expTable24;
            }
            if (t & 0x2000000 != 0) {
                balance = (balance * 1e18) / expTable25;
            }
            if (t & 0x4000000 != 0) {
                balance = (balance * 1e18) / expTable26;
            }
            if (t & 0x8000000 != 0) {
                balance = (balance * 1e18) / expTable27;
            }
            if (t & 0x10000000 != 0) {
                balance = (balance * 1e18) / expTable28;
            }
            if (t & 0x20000000 != 0) {
                balance = (balance * 1e18) / expTable29;
            }
        }
        return balance;
    }
}
