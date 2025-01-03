const { time, trim0x, constants } = require('@1inch/solidity-utils');
const { ethers } = require('hardhat');
const { buildOrder, buildTakerTraits, signOrder, buildFeeTakerExtensions } = require('@1inch/limit-order-protocol-contract/test/helpers/orderUtils');

const expBase = 999999952502977513n; // 0.05^(1/(2 years)) means 95% value loss over 2 years}

async function buildCalldataForOrder({
    orderData,
    orderSigner,
    threshold,
    setupData,
    additionalDataForSettlement = '0x',
    isInnermostOrder = false,
    isMakingAmount = true,
    fillingAmount = isMakingAmount ? orderData.makingAmount : orderData.takingAmount,
    integratorFeeRecipient = orderSigner.address,
    protocolFeeRecipient = orderSigner.address,
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

    let whitelist = ethers.solidityPacked(['uint8'], [whitelistResolvers.length]);
    let whitelistPostInteraction = ethers.solidityPacked(['uint32', 'uint8'], [auctionStartTime, whitelistResolvers.length]);
    for (let i = 0; i < whitelistResolvers.length; i++) {
        whitelistPostInteraction += trim0x(ethers.solidityPacked(['bytes10', 'uint16'], [whitelistResolvers[i], resolversAllowedTime[i] || 0]));
        whitelist += trim0x(whitelistResolvers[i]);
    }

    let makerReceiver;
    if (resolverFee > 0 || integratorFee > 0) {
        makerReceiver = orderData.receiver;
        orderData.receiver = await settlement.getAddress();
    }

    const order = buildOrder(
        orderData,
        buildFeeTakerExtensions({
            feeTaker: await settlement.getAddress(),
            getterExtraPrefix: auctionDetails,
            integratorFeeRecipient,
            protocolFeeRecipient,
            makerReceiver: (makerReceiver && makerReceiver !== constants.ZERO_ADDRESS) ? makerReceiver : undefined,
            integratorFee,
            resolverFee,
            whitelistDiscount: 0,
            whitelist,
            whitelistPostInteraction,
            customPostInteraction,
        }),
    );

    const { r, yParityAndS: vs } = ethers.Signature.from(await signOrder(order, chainId, await lopv4.getAddress(), orderSigner));

    const takerTraits = buildTakerTraits({
        makingAmount: isMakingAmount,
        threshold,
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
    details += trim0x(ethers.solidityPacked(['uint8'], [points.length]));
    for (let i = 0; i < points.length; i++) {
        details += trim0x(ethers.solidityPacked(['uint24', 'uint16'], [points[i][0], points[i][1]]));
    }
    return { gasBumpEstimate, gasPriceEstimate, startTime, duration, delay, initialRateBump, details };
}

module.exports = {
    expBase,
    buildAuctionDetails,
    buildCalldataForOrder,
};
