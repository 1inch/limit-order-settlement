const { deployContract, time, ether, constants } = require('@1inch/solidity-utils');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { buildOrder, buildMakerTraits } = require('@1inch/limit-order-protocol-contract/test/helpers/orderUtils');
const { initContractsForSettlement } = require('./helpers/fixtures');
const { buildAuctionDetails } = require('./helpers/fusionUtils');
const hre = require('hardhat');
const { network } = hre;

describe('GasBump', function () {
    before(async function () {
        if (hre.__SOLIDITY_COVERAGE_RUNNING) { this.skip(); }
    });

    after(async function () {
        await network.provider.send('hardhat_setNextBlockBaseFeePerGas', ['0x1']);
    });

    async function prepare() {
        const { contracts: { dai, weth }, accounts: { owner } } = await initContractsForSettlement();
        const checker = await deployContract('GasBumpChecker');
        const currentTime = (await time.latest()) - time.duration.minutes(1) + 1;
        const { details: auctionDetails } = await buildAuctionDetails({
            gasBumpEstimate: 10000, // 0.1% of taking amount
            gasPriceEstimate: 1000, // 1 gwei
            startTime: currentTime,
            initialRateBump: 1000000,
            points: [[500000, 60]],
        });

        const order = buildOrder({
            maker: owner.address,
            makerAsset: await dai.getAddress(),
            takerAsset: await weth.getAddress(),
            makingAmount: ether('10'),
            takingAmount: ether('1'),
            makerTraits: buildMakerTraits(),
        });

        return { order, owner, auctionDetails, checker };
    }

    async function testGetTakingAmount(checker, order, owner, auctionDetails, basefee, result) {
        await network.provider.send('hardhat_setNextBlockBaseFeePerGas', ['0x' + basefee.toString(16)]);
        await checker.testGetTakingAmount(
            order, '0x', constants.ZERO_BYTES32, owner.address, ether('10'), ether('10'), auctionDetails, result, { gasPrice: basefee },
        );
    }

    it('0 gwei = no gas fee', async function () {
        const { order, owner, auctionDetails, checker } = await loadFixture(prepare);
        await testGetTakingAmount(checker, order, owner, auctionDetails, 0, ether('1.05'));
    });

    it('0.1 gwei = 0.01% gas fee', async function () {
        const { order, owner, auctionDetails, checker } = await loadFixture(prepare);
        await testGetTakingAmount(checker, order, owner, auctionDetails, 1e8, ether('1.0499'));
    });

    it('15 gwei = 1.5% gas fee', async function () {
        const { order, owner, auctionDetails, checker } = await loadFixture(prepare);
        await testGetTakingAmount(checker, order, owner, auctionDetails, 15e9, ether('1.035'));
    });

    it('100 gwei = 10% gas fee, should be capped with takingAmount', async function () {
        const { order, owner, auctionDetails, checker } = await loadFixture(prepare);
        await testGetTakingAmount(checker, order, owner, auctionDetails, 100e9, ether('1'));
    });
});
