const { assert } = require('console');

/* eslint-disable no-multi-spaces */
const TIME_START_MASK        = 0xFFFFFFFF00000000000000000000000000000000000000000000000000000000n; // prettier-ignore
const DURATION_MASK          = 0x00000000FFFFFF00000000000000000000000000000000000000000000000000n; // prettier-ignore
const INITIAL_RATE_BUMP_MASK = 0x00000000000000FFFFFF00000000000000000000000000000000000000000000n; // prettier-ignore
const FEE_MASK               = 0x00000000000000000000FFFFFFFF000000000000000000000000000000000000n; // prettier-ignore
const SALT_MASK              = 0x0000000000000000000000000000FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFn; // prettier-ignore
/* eslint-enable no-multi-spaces */

const TIME_START_SHIFT = 224n; // orderTimeMask 224-255
const DURATION_SHIFT = 200n; // durationMask 200-223
const INITIAL_RATE_BUMP_SHIFT = 176n; // initialRateMask 176-199
const FEE_SHIFT = 144n; // orderFee 144-175

const initSaltObj = (orderSalt) => {
    return {
        startTime: (orderSalt & TIME_START_MASK) >> TIME_START_SHIFT,
        duration: (orderSalt & DURATION_MASK) >> DURATION_SHIFT,
        initialRate: (orderSalt & INITIAL_RATE_BUMP_MASK) >> INITIAL_RATE_BUMP_SHIFT,
        fee: (orderSalt & FEE_MASK) >> FEE_SHIFT,
        salt: orderSalt & SALT_MASK,
    };
};

const encodeSalt = (startTime, duration, initialRate, fee, salt) => {
    const res = (
        '0x' +
        BigInt(startTime).toString(16).padStart(8, '0') +
        BigInt(duration).toString(16).padStart(6, '0') +
        BigInt(initialRate).toString(16).padStart(6, '0') +
        BigInt(fee).toString(16).padStart(8, '0') +
        BigInt(salt).toString(16).padStart(36, '0')
    );
    assert(res.length === 66, 'Some inputs were out of allowed ranges');
    return res;
};

const getStartTime = (orderSalt) => {
    return (orderSalt & TIME_START_MASK) >> TIME_START_SHIFT;
};

const getDuration = (orderSalt) => {
    return (orderSalt & DURATION_MASK) >> DURATION_SHIFT;
};

const getInitialRateBump = (orderSalt) => {
    return (orderSalt & INITIAL_RATE_BUMP_MASK) >> INITIAL_RATE_BUMP_SHIFT;
};

const getFee = (orderSalt) => {
    return (orderSalt & FEE_MASK) >> FEE_SHIFT;
};

const getSalt = (orderSalt) => {
    return orderSalt & SALT_MASK;
};

module.exports = {
    initSaltObj,
    encodeSalt,
    getStartTime,
    getDuration,
    getInitialRateBump,
    getFee,
    getSalt,
};
