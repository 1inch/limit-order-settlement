// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

abstract contract VotingPowerCalculator {
    uint256 public immutable origin;
    uint256 public immutable expBase;
    uint256 public immutable expTable1;
    uint256 public immutable expTable2;
    uint256 public immutable expTable3;
    uint256 public immutable expTable4;
    uint256 public immutable expTable5;
    uint256 public immutable expTable6;
    uint256 public immutable expTable7;
    uint256 public immutable expTable8;
    uint256 public immutable expTable9;
    uint256 public immutable expTable10;
    uint256 public immutable expTable11;
    uint256 public immutable expTable12;
    uint256 public immutable expTable13;
    uint256 public immutable expTable14;
    uint256 public immutable expTable15;
    uint256 public immutable expTable16;
    uint256 public immutable expTable17;
    uint256 public immutable expTable18;
    uint256 public immutable expTable19;
    uint256 public immutable expTable20;
    uint256 public immutable expTable21;
    uint256 public immutable expTable22;
    uint256 public immutable expTable23;
    uint256 public immutable expTable24;
    uint256 public immutable expTable25;
    uint256 public immutable expTable26;
    uint256 public immutable expTable27;
    uint256 public immutable expTable28;
    uint256 public immutable expTable29;

    constructor(
        uint256 _expBase,
        uint256 _origin
    ) {
        origin = _origin;
        expBase = _expBase;
        expTable1 = (expBase * expBase) / 1e18;
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

    function votingPowerOf(uint256 balance) public view returns (uint256) {
        // solhint-disable-next-line not-rely-on-time
        return _exp(balance, block.timestamp - origin);
    }

    function votingPowerOf(uint256 balance, uint256 timestamp) public view returns (uint256) {
        return _exp(balance, timestamp - origin);
    }

    function _exp(uint256 point, uint256 t) private view returns (uint256) {
        unchecked {
            if (t & 0x01 != 0) {
                point = (point * expBase) / 1e18;
            }
            if (t & 0x02 != 0) {
                point = (point * expTable1) / 1e18;
            }
            if (t & 0x04 != 0) {
                point = (point * expTable2) / 1e18;
            }
            if (t & 0x08 != 0) {
                point = (point * expTable3) / 1e18;
            }
            if (t & 0x10 != 0) {
                point = (point * expTable4) / 1e18;
            }
            if (t & 0x20 != 0) {
                point = (point * expTable5) / 1e18;
            }
            if (t & 0x40 != 0) {
                point = (point * expTable6) / 1e18;
            }
            if (t & 0x80 != 0) {
                point = (point * expTable7) / 1e18;
            }
            if (t & 0x100 != 0) {
                point = (point * expTable8) / 1e18;
            }
            if (t & 0x200 != 0) {
                point = (point * expTable9) / 1e18;
            }
            if (t & 0x400 != 0) {
                point = (point * expTable10) / 1e18;
            }
            if (t & 0x800 != 0) {
                point = (point * expTable11) / 1e18;
            }
            if (t & 0x1000 != 0) {
                point = (point * expTable12) / 1e18;
            }
            if (t & 0x2000 != 0) {
                point = (point * expTable13) / 1e18;
            }
            if (t & 0x4000 != 0) {
                point = (point * expTable14) / 1e18;
            }
            if (t & 0x8000 != 0) {
                point = (point * expTable15) / 1e18;
            }
            if (t & 0x10000 != 0) {
                point = (point * expTable16) / 1e18;
            }
            if (t & 0x20000 != 0) {
                point = (point * expTable17) / 1e18;
            }
            if (t & 0x40000 != 0) {
                point = (point * expTable18) / 1e18;
            }
            if (t & 0x80000 != 0) {
                point = (point * expTable19) / 1e18;
            }
            if (t & 0x100000 != 0) {
                point = (point * expTable20) / 1e18;
            }
            if (t & 0x200000 != 0) {
                point = (point * expTable21) / 1e18;
            }
            if (t & 0x400000 != 0) {
                point = (point * expTable22) / 1e18;
            }
            if (t & 0x800000 != 0) {
                point = (point * expTable23) / 1e18;
            }
            if (t & 0x1000000 != 0) {
                point = (point * expTable24) / 1e18;
            }
            if (t & 0x2000000 != 0) {
                point = (point * expTable25) / 1e18;
            }
            if (t & 0x4000000 != 0) {
                point = (point * expTable26) / 1e18;
            }
            if (t & 0x8000000 != 0) {
                point = (point * expTable27) / 1e18;
            }
            if (t & 0x10000000 != 0) {
                point = (point * expTable28) / 1e18;
            }
            if (t & 0x20000000 != 0) {
                point = (point * expTable29) / 1e18;
            }
        }
        return point;
    }

    function _invExp(uint256 point, uint256 t) internal view returns (uint256) {
        unchecked {
            if (t & 0x01 != 0) {
                point = (point * 1e18) / expBase;
            }
            if (t & 0x02 != 0) {
                point = (point * 1e18) / expTable1;
            }
            if (t & 0x04 != 0) {
                point = (point * 1e18) / expTable2;
            }
            if (t & 0x08 != 0) {
                point = (point * 1e18) / expTable3;
            }
            if (t & 0x10 != 0) {
                point = (point * 1e18) / expTable4;
            }
            if (t & 0x20 != 0) {
                point = (point * 1e18) / expTable5;
            }
            if (t & 0x40 != 0) {
                point = (point * 1e18) / expTable6;
            }
            if (t & 0x80 != 0) {
                point = (point * 1e18) / expTable7;
            }
            if (t & 0x100 != 0) {
                point = (point * 1e18) / expTable8;
            }
            if (t & 0x200 != 0) {
                point = (point * 1e18) / expTable9;
            }
            if (t & 0x400 != 0) {
                point = (point * 1e18) / expTable10;
            }
            if (t & 0x800 != 0) {
                point = (point * 1e18) / expTable11;
            }
            if (t & 0x1000 != 0) {
                point = (point * 1e18) / expTable12;
            }
            if (t & 0x2000 != 0) {
                point = (point * 1e18) / expTable13;
            }
            if (t & 0x4000 != 0) {
                point = (point * 1e18) / expTable14;
            }
            if (t & 0x8000 != 0) {
                point = (point * 1e18) / expTable15;
            }
            if (t & 0x10000 != 0) {
                point = (point * 1e18) / expTable16;
            }
            if (t & 0x20000 != 0) {
                point = (point * 1e18) / expTable17;
            }
            if (t & 0x40000 != 0) {
                point = (point * 1e18) / expTable18;
            }
            if (t & 0x80000 != 0) {
                point = (point * 1e18) / expTable19;
            }
            if (t & 0x100000 != 0) {
                point = (point * 1e18) / expTable20;
            }
            if (t & 0x200000 != 0) {
                point = (point * 1e18) / expTable21;
            }
            if (t & 0x400000 != 0) {
                point = (point * 1e18) / expTable22;
            }
            if (t & 0x800000 != 0) {
                point = (point * 1e18) / expTable23;
            }
            if (t & 0x1000000 != 0) {
                point = (point * 1e18) / expTable24;
            }
            if (t & 0x2000000 != 0) {
                point = (point * 1e18) / expTable25;
            }
            if (t & 0x4000000 != 0) {
                point = (point * 1e18) / expTable26;
            }
            if (t & 0x8000000 != 0) {
                point = (point * 1e18) / expTable27;
            }
            if (t & 0x10000000 != 0) {
                point = (point * 1e18) / expTable28;
            }
            if (t & 0x20000000 != 0) {
                point = (point * 1e18) / expTable29;
            }
        }
        return point;
    }
}
