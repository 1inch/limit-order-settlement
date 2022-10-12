const { toBN } = require('@1inch/solidity-utils');

/* eslint-disable no-multi-spaces */
const TIME_START_MASK        = toBN('0xFFFFFFFF00000000000000000000000000000000000000000000000000000000'); // prettier-ignore
const DURATION_MASK          = toBN('0x00000000FFFFFFFF000000000000000000000000000000000000000000000000'); // prettier-ignore
const INITIAL_RATE_BUMP_MASK = toBN('0x0000000000000000FFFF00000000000000000000000000000000000000000000'); // prettier-ignore
const FEE_MASK               = toBN('0x00000000000000000000FFFFFFFF000000000000000000000000000000000000'); // prettier-ignore
const SALT_MASK              = toBN('0x0000000000000000000000000000FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF'); // prettier-ignore
/* eslint-enable no-multi-spaces */

const TIME_START_SHIFT = 224; // orderTimeMask 224-255
const DURATION_SHIFT = 192; // durationMask 192-223
const INITIAL_RATE_BUMP_SHIFT = 176; // initialRateMask 176-191
const FEE_SHIFT = 144; // orderFee 144-175

const initSaltObj = (orderSalt) => {
    return {
        startTime: orderSalt.and(TIME_START_MASK).shrn(TIME_START_SHIFT),
        duration: orderSalt.and(DURATION_MASK).shrn(DURATION_SHIFT),
        initialRate: orderSalt.and(INITIAL_RATE_BUMP_MASK).shrn(INITIAL_RATE_BUMP_SHIFT),
        fee: orderSalt.and(FEE_MASK).shrn(FEE_SHIFT),
        salt: orderSalt.and(SALT_MASK),
    };
};

const encodeParameters = (startTime, duration, initialRate, fee, salt) => {
    return (
        '0x' +
        web3.eth.abi.encodeParameter('uint32', startTime).substr(-8) +
        web3.eth.abi.encodeParameter('uint32', duration).substr(-8) +
        web3.eth.abi.encodeParameter('uint16', initialRate).substr(-4) +
        web3.eth.abi.encodeParameter('uint32', fee).substr(-8) +
        web3.eth.abi.encodeParameter('uint144', salt).substr(-36)
    );
};

const getStartTime = (orderSalt) => {
    return orderSalt.and(TIME_START_MASK).shrn(TIME_START_SHIFT);
};

const getDuration = (orderSalt) => {
    return orderSalt.and(DURATION_MASK).shrn(DURATION_SHIFT);
};

const getInitialRateBump = (orderSalt) => {
    return orderSalt.and(INITIAL_RATE_BUMP_MASK).shrn(INITIAL_RATE_BUMP_SHIFT);
};

const getFee = (orderSalt) => {
    return orderSalt.and(FEE_MASK).shrn(FEE_SHIFT);
};

const getSalt = (orderSalt) => {
    return orderSalt.and(SALT_MASK);
};

module.exports = {
    initSaltObj,
    encodeParameters,
    getStartTime,
    getDuration,
    getInitialRateBump,
    getFee,
    getSalt,
};
