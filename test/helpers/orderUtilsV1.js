const { constants, trim0x, time, assert } = require('@1inch/solidity-utils');

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

const Order = [
    { name: 'salt', type: 'uint256' },
    { name: 'makerAsset', type: 'address' },
    { name: 'takerAsset', type: 'address' },
    { name: 'maker', type: 'address' },
    { name: 'receiver', type: 'address' },
    { name: 'allowedSender', type: 'address' },
    { name: 'makingAmount', type: 'uint256' },
    { name: 'takingAmount', type: 'uint256' },
    { name: 'offsets', type: 'uint256' },
    { name: 'interactions', type: 'bytes' },
];

const name = '1inch Limit Order Protocol';
const version = '3';

const buildOrder = async (
    {
        salt,
        makerAsset,
        takerAsset,
        makingAmount,
        takingAmount,
        allowedSender = constants.ZERO_ADDRESS,
        receiver = constants.ZERO_ADDRESS,
        from: maker = constants.ZERO_ADDRESS,
    },
    {
        makerAssetData = '0x',
        takerAssetData = '0x',
        getMakingAmount = '0x',
        getTakingAmount = '0x',
        predicate = '0x',
        permit = '0x',
        preInteraction = '0x',
        postInteraction = '0x',
        whitelistedAddrs = [],
        whitelistedCutOffs = [],
        publicCutOff = 0xffffffff,
        takerFeeReceiver = constants.ZERO_ADDRESS,
        takerFeeRatio = 0,
        auctionBumps = [],
        auctionDelays = [],
    } = {},
) => {
    if (getMakingAmount === '') {
        getMakingAmount = '0x78'; // "x"
    }
    if (getTakingAmount === '') {
        getTakingAmount = '0x78'; // "x"
    }
    if (typeof salt === 'undefined') {
        salt = buildSalt({ orderStartTime: await defaultExpiredAuctionTimestamp() });
    }

    const allInteractions = [
        makerAssetData,
        takerAssetData,
        getMakingAmount,
        getTakingAmount,
        predicate,
        permit,
        preInteraction,
        postInteraction,
    ];

    const interactions = '0x' + allInteractions.map(trim0x).join('');

    // https://stackoverflow.com/a/55261098/440168
    const cumulativeSum = ((sum) => (value) => {
        sum += value;
        return sum;
    })(0);
    const offsets = allInteractions
        .map((a) => a.length / 2 - 1)
        .map(cumulativeSum)
        .reduce((acc, a, i) => acc + (BigInt(a) << BigInt(32 * i)), BigInt(0));

    if (whitelistedAddrs.length !== whitelistedCutOffs.length) {
        throw new Error('whitelist length mismatch');
    }

    if (auctionBumps.length !== auctionDelays.length) {
        throw new Error('auction length mismatch');
    }

    const auctionParams = auctionBumps.map((b, i) => auctionDelays[i].toString(16).padStart(4, '0') + b.toString(16).padStart(6, '0')).join('');

    const whitelist = whitelistedAddrs.map((a, i) => whitelistedCutOffs[i].toString(16).padStart(8, '0') + trim0x(a)).join('') +
        publicCutOff.toString(16).padStart(8, '0');

    const takingFeeData = takerFeeReceiver === constants.ZERO_ADDRESS || takerFeeRatio === 0
        ? ''
        : takerFeeRatio.toString(16).padStart(24, '0') + trim0x(takerFeeReceiver);

    let flags = (BigInt(whitelistedAddrs.length) << 3n) | BigInt(auctionBumps.length);
    if (takingFeeData !== '') {
        flags |= 0x80n;
    }

    return {
        salt,
        makerAsset,
        takerAsset,
        maker,
        receiver,
        allowedSender,
        makingAmount: makingAmount.toString(),
        takingAmount: takingAmount.toString(),
        offsets: offsets.toString(),
        interactions: interactions + auctionParams + whitelist + takingFeeData + flags.toString(16).padStart(2, '0'),
    };
};

const defaultExpiredAuctionTimestamp = async () => (await time.latest()) - 1800n;

const buildSalt = ({
    orderStartTime,
    initialStartRate = 1000000, // 10000000 = 100%
    duration = 180, // seconds
    fee = 0, // in wei
    salt = '1', // less than uint176
}) => encodeSalt(orderStartTime, duration, initialStartRate, fee, salt);

async function signOrder(order, chainId, target, wallet) {
    return await wallet.signTypedData({ name, version, chainId, verifyingContract: target }, { Order }, order);
}

module.exports = {
    buildOrder,
    buildSalt,
    signOrder,
};
