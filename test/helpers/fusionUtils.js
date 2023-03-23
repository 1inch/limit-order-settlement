const { time, trim0x } = require('@1inch/solidity-utils');
const { assert } = require('chai');

async function buildFusion({
    resolvers = [],
    points = [],
    auctionStart,
    auctionDuration = time.duration.hours(1),
    initialRateBump = 0n,
    resolverFee = 0n,
    publicTimeLimit,
    takerFee = 0n,
    takerFeeReceiver = undefined,
} = {}) {
    if (!auctionStart) {
        auctionStart = await time.latest();
    }

    if (!publicTimeLimit) {
        publicTimeLimit = auctionStart + (auctionDuration >> 1);
    }
    // 1 bytes          - flags
    // 4 bytes          - auction start
    // 3 bytes          - auction duration
    // 3 bytes          - initial rate bump
    // 4 bytes          - resolver fee
    // 4 bytes          - public time limit
    // N*(2 + 10 bytes) - resolvers with corresponding seconds delay until public time limit
    // M*(2 + 3 bytes)  - auction points coefficients with seconds delays from auction start
    // 24 bytes         - taking fee (optional if flags has _HAS_TAKING_FEE_FLAG)
    assert(resolvers.length <= 15, 'Too many resolvers');
    assert(points.length <= 7, 'Too many points');
    assert(BigInt(auctionStart) < (1n << 32n), 'Auction start is too big');
    assert(BigInt(auctionDuration) < (1n << 24n), 'Auction duration is too big');
    assert(BigInt(initialRateBump) < (1n << 24n), 'Initial rate bump is too big');
    assert(BigInt(resolverFee) < (1n << 32n), 'Resolver fee is too big');
    assert(BigInt(publicTimeLimit) < (1n << 32n), 'Public time limit is too big');

    const flags = (takerFee > 0 ? 0x80 : 0) | (resolvers.length << 3) | points.length;
    return '0x' + flags.toString(16).padStart(2, '0') +
        auctionStart.toString(16).padStart(8, '0') +
        auctionDuration.toString(16).padStart(6, '0') +
        initialRateBump.toString(16).padStart(6, '0') +
        resolverFee.toString(16).padStart(8, '0') +
        publicTimeLimit.toString(16).padStart(8, '0') +
        resolvers.map((resolver, i) => {
            const delay = resolvers.length === 1 ? auctionDuration : auctionDuration / 4;
            assert(BigInt(delay) < (1n << 16n), 'Resolver delay is too big');
            return delay.toString(16).padStart(4, '0') + resolver.substring(22);
        }).join('') +
        points.map(([delay, coefficient]) => {
            assert(BigInt(delay) < (1n << 16n), 'Point delay is too big');
            return delay.toString(16).padStart(4, '0') + coefficient.toString(16).padStart(6, '0');
        }).join('') +
        (takerFee > 0 ? takerFee.toString(16).padStart(8, '0') + trim0x(takerFeeReceiver) : '');
}

module.exports = {
    buildFusion,
};
