const { toBN } = require('@1inch/solidity-utils');

const ORDER_TIME_START_MASK = toBN('0xFFFFFFFF00000000000000000000000000000000000000000000000000000000');
const ORDER_DURATION_MASK = toBN('0x00000000FFFFFFFF000000000000000000000000000000000000000000000000');
const ORDER_INITIAL_RATE_MASK = toBN('0x0000000000000000FFFF00000000000000000000000000000000000000000000');
const ORDER_FEE_MASK = toBN('0x00000000000000000000FFFFFFFF000000000000000000000000000000000000');
const ORDER_SALT_MASK = toBN('0x0000000000000000000000000000FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF');

const ORDER_TIME_START_SHIFT = 224; // orderTimeMask 224-255
const ORDER_DURATION_SHIFT = 192; // durationMask 192-223
const ORDER_INITIAL_RATE_SHIFT = 176; // initialRateMask 176-191
const ORDER_FEE_SHIFT = 144; // orderFee 144-175

const init = (orderSalt) => {
    return {
        startTime: orderSalt.and(ORDER_TIME_START_MASK).shrn(ORDER_TIME_START_SHIFT),
        duration: orderSalt.and(ORDER_DURATION_MASK).shrn(ORDER_DURATION_SHIFT),
        initialRate: orderSalt.and(ORDER_INITIAL_RATE_MASK).shrn(ORDER_INITIAL_RATE_SHIFT),
        fee: orderSalt.and(ORDER_FEE_MASK).shrn(ORDER_FEE_SHIFT),
        salt: orderSalt.and(ORDER_SALT_MASK),
    };
};

const create = (startTime, duration, initialRate, fee, salt) => {
    return {
        startTime,
        duration,
        initialRate,
        fee,
        salt,
    };
};

const encodeParameters = (startTime, duration, initialRate, fee, salt) => {
    return '0x' +
            web3.eth.abi.encodeParameter('uint32', startTime).substr(-8) +
            web3.eth.abi.encodeParameter('uint32', duration).substr(-8) +
            web3.eth.abi.encodeParameter('uint16', initialRate).substr(-4) +
            web3.eth.abi.encodeParameter('uint32', fee).substr(-8) +
            web3.eth.abi.encodeParameter('uint144', salt).substr(-36);
};

const parserObjToOrderSalt = (parserObj) => {
    return toBN(parserObj.startTime).shln(ORDER_TIME_START_SHIFT).add(
        toBN(parserObj.duration).shln(ORDER_DURATION_SHIFT).add(
            toBN(parserObj.initialRate).shln(ORDER_INITIAL_RATE_SHIFT).add(
                toBN(parserObj.fee).shln(ORDER_FEE_SHIFT).add(
                    toBN(parserObj.salt),
                ),
            ),
        ),
    );
};

const onlyStartTime = (orderSalt) => {
    return orderSalt.and(ORDER_TIME_START_MASK).shrn(ORDER_TIME_START_SHIFT);
};

const onlyDuration = (orderSalt) => {
    return orderSalt.and(ORDER_DURATION_MASK).shrn(ORDER_DURATION_SHIFT);
};

const onlyInitialRate = (orderSalt) => {
    return orderSalt.and(ORDER_INITIAL_RATE_MASK).shrn(ORDER_INITIAL_RATE_SHIFT);
};

const onlyFee = (orderSalt) => {
    return orderSalt.and(ORDER_FEE_MASK).shrn(ORDER_FEE_SHIFT);
};

const onlySalt = (orderSalt) => {
    return orderSalt.and(ORDER_SALT_MASK);
};

module.exports = {
    init,
    create,
    encodeParameters,
    parserObjToOrderSalt,
    onlyStartTime,
    onlyDuration,
    onlyInitialRate,
    onlyFee,
    onlySalt,
};
