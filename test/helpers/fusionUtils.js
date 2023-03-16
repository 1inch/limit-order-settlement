const { time } = require('@1inch/solidity-utils');
const { assert } = require('chai');

async function buildFusion({
    resolvers = [],
    points = [[0, 1]],
    timeStart,
    duration = time.duration.hours(1),
    initialRateBump = 0n,
    resolverFee = 0n,
    publicTimeLimit,
} = {}) {
    if (!timeStart) {
        timeStart = await time.latest();
    }
    if (!publicTimeLimit) {
        publicTimeLimit = timeStart + (duration >> 1);
    }

    // 1 bytes          - flags
    // 4 bytes          - order time start
    // 3 bytes          - order duration
    // 3 bytes          - initial rate bump
    // 4 bytes          - resolver fee
    // 4 bytes          - public time limit
    // N*(4 + 10 bytes) - resolver with corresponding time delay from order time start
    // M*(2 + 3 bytes)  - auction points coefficients with seconds delays from order time start
    // 24 bytes         - taking fee (optional if flags has _HAS_TAKING_FEE_FLAG)
    assert(resolvers.length <= 15, 'Too many resolvers');
    assert(points.length <= 7, 'Too many points');
    assert(BigInt(timeStart) < (1n << 32n), 'Time start is too big');
    assert(BigInt(duration) < (1n << 24n), 'Duration is too big');
    assert(BigInt(initialRateBump) < (1n << 24n), 'Initial rate bump is too big');
    assert(BigInt(resolverFee) < (1n << 32n), 'Resolver fee is too big');
    assert(BigInt(publicTimeLimit) < (1n << 32n), 'Public time limit is too big');

    const flags = (resolvers.length << 3) | points.length;
    return '0x' + flags.toString(16).padStart(2, '0') +
        timeStart.toString(16).padStart(8, '0') +
        duration.toString(16).padStart(6, '0') +
        initialRateBump.toString(16).padStart(6, '0') +
        resolverFee.toString(16).padStart(8, '0') +
        publicTimeLimit.toString(16).padStart(8, '0') +
        resolvers.map((resolver, i) => {
            const delay = timeStart + Math.round((duration * i) / resolvers.length);
            return delay.toString(16).padStart(8, '0') + resolver.substring(22);
        }).join('') +
        points.map(([delay, coefficient]) => {
            return delay.toString(16).padStart(4, '0') + coefficient.toString(16).padStart(6, '0');
        }).join('');
}

module.exports = {
    buildFusion,
};
