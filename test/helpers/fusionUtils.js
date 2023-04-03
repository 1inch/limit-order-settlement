const { time, trim0x } = require('@1inch/solidity-utils');
const { assert } = require('chai');
const { keccak256 } = require('ethers/lib/utils');

async function buildFusions(params) {
    const allResolvers = [...new Set(params.flatMap((param) => param.resolvers).filter(item => item !== undefined))];
    const currentTime = await time.latest();
    const fusions = [];

    for (let {
        resolvers = [],
        points = [],
        startTime,
        auctionDelay = 0n,
        auctionDuration = time.duration.hours(1),
        initialRateBump = 0n,
        resolverFee = 0n,
        publicTimeDelay,
        takerFee = 0n,
        takerFeeReceiver = undefined,
    } of params) {
        if (!startTime) {
            startTime = currentTime;
        }

        if (!publicTimeDelay) {
            publicTimeDelay = auctionDuration >> 1;
        }

        // Order `interaction` prefix structure:
        // struct Data {
        //     bytes1 flags;
        //     bytes4 startTime;
        //     bytes2 auctionDelay;
        //     bytes3 auctionDuration;
        //     bytes3 initialRateBump;
        //     bytes4 resolverFee;
        //     bytes2 publicTimeDelay;
        //     (bytes2,bytes10)[N] resolversAndTimeDeltas;
        //     (bytes2,bytes3)[M] pointsAndTimeDeltas;
        //     bytes24? takingFee; // optional if flags has _HAS_TAKING_FEE_FLAG
        // }
        assert(resolvers.length <= 15, 'Too many resolvers');
        assert(points.length <= 7, 'Too many points');
        assert(BigInt(startTime) < (1n << 32n), 'Auction start is too big');
        assert(BigInt(auctionDelay) < (1n << 16n), 'Auction delay is too big');
        assert(BigInt(auctionDuration) < (1n << 24n), 'Auction duration is too big');
        assert(BigInt(initialRateBump) < (1n << 24n), 'Initial rate bump is too big');
        assert(BigInt(resolverFee) < (1n << 32n), 'Resolver fee is too big');
        assert(BigInt(publicTimeDelay) < (1n << 16n), 'Public time delay is too big');

        const flags = (takerFee > 0 ? 0x80 : 0) | (resolvers.length << 3) | points.length;

        fusions.push(
            '0x' + flags.toString(16).padStart(2, '0') +
            startTime.toString(16).padStart(8, '0') +
            auctionDelay.toString(16).padStart(4, '0') +
            auctionDuration.toString(16).padStart(6, '0') +
            initialRateBump.toString(16).padStart(6, '0') +
            resolverFee.toString(16).padStart(8, '0') +
            publicTimeDelay.toString(16).padStart(4, '0') +
            resolvers.map((resolver, i) => {
                const delta = i === 0 ? 0 : auctionDuration / resolvers.length;
                assert(BigInt(delta) < (1n << 16n), 'Resolver time delta is too big');
                return allResolvers.indexOf(resolver).toString(16).padStart(2, '0') + delta.toString(16).padStart(4, '0');
            }).join('') +
            points.map(([delta, bump]) => {
                assert(BigInt(delta) < (1n << 16n), 'Point time delta is too big');
                return bump.toString(16).padStart(6, '0') + delta.toString(16).padStart(4, '0');
            }).join('') +
            (takerFee > 0 ? takerFee.toString(16).padStart(8, '0') + trim0x(takerFeeReceiver) : ''),
        );
    }

    return {
        fusions,
        hashes: (await Promise.all(params.map(buildFusion))).map(keccak256),
        resolvers: '0x' + allResolvers.map((resolver) => resolver.substring(22)).join('') + allResolvers.length.toString(16).padStart(2, '0'),
    };
}

async function buildFusion({
    resolvers = [],
    points = [],
    startTime,
    auctionDelay = 0n,
    auctionDuration = time.duration.hours(1),
    initialRateBump = 0n,
    resolverFee = 0n,
    publicTimeDelay,
    takerFee = 0n,
    takerFeeReceiver = undefined,
} = {}) {
    if (!startTime) {
        startTime = await time.latest();
    }

    if (!publicTimeDelay) {
        publicTimeDelay = auctionDuration >> 1;
    }

    // Order `interaction` prefix structure:
    // struct Data {
    //     bytes1 flags;
    //     bytes4 startTime;
    //     bytes2 auctionDelay;
    //     bytes3 auctionDuration;
    //     bytes3 initialRateBump;
    //     bytes4 resolverFee;
    //     bytes2 publicTimeDelay;
    //     (bytes2,bytes10)[N] resolversAndTimeDeltas;
    //     (bytes2,bytes3)[M] pointsAndTimeDeltas;
    //     bytes24? takingFee; // optional if flags has _HAS_TAKING_FEE_FLAG
    // }
    assert(resolvers.length <= 15, 'Too many resolvers');
    assert(points.length <= 7, 'Too many points');
    assert(BigInt(startTime) < (1n << 32n), 'Auction start is too big');
    assert(BigInt(auctionDelay) < (1n << 16n), 'Auction delay is too big');
    assert(BigInt(auctionDuration) < (1n << 24n), 'Auction duration is too big');
    assert(BigInt(initialRateBump) < (1n << 24n), 'Initial rate bump is too big');
    assert(BigInt(resolverFee) < (1n << 32n), 'Resolver fee is too big');
    assert(BigInt(publicTimeDelay) < (1n << 16n), 'Public time delay is too big');

    const flags = (takerFee > 0 ? 0x80 : 0) | (resolvers.length << 3) | points.length;
    return '0x' + flags.toString(16).padStart(2, '0') +
        startTime.toString(16).padStart(8, '0') +
        auctionDelay.toString(16).padStart(4, '0') +
        auctionDuration.toString(16).padStart(6, '0') +
        initialRateBump.toString(16).padStart(6, '0') +
        resolverFee.toString(16).padStart(8, '0') +
        publicTimeDelay.toString(16).padStart(4, '0') +
        resolvers.map((resolver, i) => {
            const delta = i === 0 ? 0 : auctionDuration / resolvers.length;
            assert(BigInt(delta) < (1n << 16n), 'Resolver time delta is too big');
            return resolver.substring(22) + delta.toString(16).padStart(4, '0');
        }).join('') +
        points.map(([delta, bump]) => {
            assert(BigInt(delta) < (1n << 16n), 'Point time delta is too big');
            return bump.toString(16).padStart(6, '0') + delta.toString(16).padStart(4, '0');
        }).join('') +
        (takerFee > 0 ? takerFee.toString(16).padStart(8, '0') + trim0x(takerFeeReceiver) : '');
}

module.exports = {
    buildFusions,
};
