const { time, trim0x, constants } = require('@1inch/solidity-utils');
const { ethers } = require('hardhat');
const { buildOrder, buildTakerTraits, signOrder } = require('@1inch/limit-order-protocol-contract/test/helpers/orderUtils');

const expBase = 999999952502977513n; // 0.05^(1/(2 years)) means 95% value loss over 2 years

function buildExtensionsBitmapData({
    resolvers = 1,
    feeType = 0,
} = {}) {
    const WHITELIST_BITMAP_OFFSET = 3; // Bitmap: VVVVVxxx
    const FEE_RESOLVER_FLAG = 1;
    const FEE_INTEGRATOR_FLAG = 2;
    const CUSTOM_RECEIVER_FLAG = 4;
    return ethers.toBeHex(
        (resolvers << WHITELIST_BITMAP_OFFSET) |
        feeType & FEE_RESOLVER_FLAG |
        feeType & FEE_INTEGRATOR_FLAG |
        feeType & CUSTOM_RECEIVER_FLAG,
    );
}

async function buildCalldataForOrder({
    orderData,
    orderSigner,
    minReturn,
    setupData,
    additionalDataForSettlement = '',
    isInnermostOrder = false,
    isMakingAmount = true,
    fillingAmount = isMakingAmount ? orderData.makingAmount : orderData.takingAmount,
    integrator = orderSigner.address,
    resolverFee = 0,
    integratorFee = 0,
    whitelistResolvers = [], // bytes10[]
    resolversAllowedTime = [], // uint16[]
    customPostInteraction = '0x',
}) {
    const {
        contracts: { lopv4, settlement, resolver },
        others: { chainId },
        auction: { startTime: auctionStartTime, details: auctionDetails },
    } = setupData;

    let postInteractionResolverFee = '';
    let postInteractionIntegratorFee = '';
    let feeType = 0;
    if (resolverFee > 0) {
        feeType += 1;
        postInteractionResolverFee = trim0x(ethers.solidityPacked(['bytes4'], ['0x' + resolverFee.toString(16).padStart(8, '0')]));
    }
    if (integratorFee > 0) {
        feeType += 2;
        postInteractionIntegratorFee = trim0x(ethers.solidityPacked(['bytes2', 'bytes20'], ['0x' + integratorFee.toString(16).padStart(4, '0'), integrator]));
        if (orderData.receiver && orderData.receiver !== constants.ZERO_ADDRESS) {
            feeType += 4;
            postInteractionIntegratorFee += trim0x(orderData.receiver);
        }
        orderData.receiver = setupData.contracts.settlement.target;
    }

    let whitelistData = '';
    for (let i = 0; i < whitelistResolvers.length; i++) {
        whitelistData += trim0x(ethers.solidityPacked(['bytes10', 'uint16'], [whitelistResolvers[i], resolversAllowedTime[i] || 0]));
    }

    const order = buildOrder(orderData, {
        makingAmountData: await settlement.getAddress() + trim0x(auctionDetails),
        takingAmountData: await settlement.getAddress() + trim0x(auctionDetails),
        postInteraction: await settlement.getAddress() +
            postInteractionIntegratorFee +
            postInteractionResolverFee +
            trim0x(ethers.solidityPacked(['uint32'], [auctionStartTime])) +
            whitelistData +
            trim0x(customPostInteraction) +
            trim0x(ethers.solidityPacked(['bytes1'], [buildExtensionsBitmapData({ resolvers: whitelistResolvers.length, feeType })])),
    });

    const { r, yParityAndS: vs } = ethers.Signature.from(await signOrder(order, chainId, await lopv4.getAddress(), orderSigner));

    await resolver.approve(order.takerAsset, lopv4);

    const takerTraits = buildTakerTraits({
        makingAmount: isMakingAmount,
        minReturn,
        extension: order.extension,
        interaction: await resolver.getAddress() + (isInnermostOrder ? '01' : '00') + trim0x(additionalDataForSettlement),
        target: await resolver.getAddress(),
    });

    return lopv4.interface.encodeFunctionData('fillOrderArgs', [
        order,
        r,
        vs,
        fillingAmount,
        takerTraits.traits,
        takerTraits.args,
    ]);
}

async function buildAuctionDetails({
    gasBumpEstimate = 0,
    gasPriceEstimate = 0,
    startTime, // default is time.latest()
    duration = 1800, // default is 30 minutes
    delay = 0,
    initialRateBump = 0,
    points = [],
} = {}) {
    startTime = startTime || await time.latest();
    let details = ethers.solidityPacked(
        ['uint24', 'uint32', 'uint32', 'uint24', 'uint24'], [gasBumpEstimate, gasPriceEstimate, startTime + delay, duration, initialRateBump],
    );
    for (let i = 0; i < points.length; i++) {
        details += trim0x(ethers.solidityPacked(['uint24', 'uint16'], [points[i][0], points[i][1]]));
    }
    return { gasBumpEstimate, gasPriceEstimate, startTime, duration, delay, initialRateBump, details };
}

module.exports = {
    expBase,
    buildAuctionDetails,
    buildCalldataForOrder,
    buildExtensionsBitmapData,
};
