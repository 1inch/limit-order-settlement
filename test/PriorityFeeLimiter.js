const { expect, deployContract, ether, constants } = require('@1inch/solidity-utils');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { buildOrder, buildMakerTraits } = require('@1inch/limit-order-protocol-contract/test/helpers/orderUtils');
const { initContractsForSettlement } = require('./helpers/fixtures');
const { buildSettlementExtensions } = require('./helpers/fusionUtils');
const hre = require('hardhat');
const { network } = hre;

describe('PriorityFeeLimiter', function () {
    before(async function () {
        if (hre.__SOLIDITY_COVERAGE_RUNNING) { this.skip(); }
    });

    after(async function () {
        await network.provider.send('hardhat_setNextBlockBaseFeePerGas', ['0x1']);
    });

    async function prepare() {
        const { contracts: { dai, weth, accessToken }, accounts: { owner } } = await initContractsForSettlement();
        const settlementExtension = await deployContract('Settlement', [owner, weth, accessToken, weth, owner]);
        const makingAmount = ether('10');
        const takingAmount = ether('1');

        const extensions = buildSettlementExtensions({
            feeTaker: await settlementExtension.getAddress(),
            estimatedTakingAmount: takingAmount,
            whitelistPostInteraction: '0x0000000000',
        });

        const order = buildOrder(
            {
                maker: owner.address,
                makerAsset: await dai.getAddress(),
                takerAsset: await weth.getAddress(),
                makingAmount,
                takingAmount,
                makerTraits: buildMakerTraits(),
            },
            extensions,
        );

        return { order, owner, postInteractionData: '0x' + extensions.postInteraction.substring(42), settlementExtension };
    }

    function sendPostInteractionTxn(settlementExtension, order, owner, postInteractionData, maxPriorityFeePerGas) {
        return settlementExtension.postInteraction(
            order, '0x', constants.ZERO_BYTES32, owner.address, ether('10'), ether('1'), ether('10'), postInteractionData,
            { maxPriorityFeePerGas },
        );
    }

    it('8 gwei base, 4 gwei priority should work', async function () {
        const { order, owner, postInteractionData, settlementExtension } = await loadFixture(prepare);

        await network.provider.send('hardhat_setNextBlockBaseFeePerGas', ['0x1dcd65000']); // 8 gwei

        await sendPostInteractionTxn(settlementExtension, order, owner, postInteractionData, 4000000000);
    });

    it('8 gwei base, 6 gwei priority should not work', async function () {
        const { order, owner, postInteractionData, settlementExtension } = await loadFixture(prepare);

        await network.provider.send('hardhat_setNextBlockBaseFeePerGas', ['0x1dcd65000']); // 8 gwei

        const postInteractionTxn = sendPostInteractionTxn(settlementExtension, order, owner, postInteractionData, 6000000000);
        await expect(postInteractionTxn).to.be.revertedWithCustomError(settlementExtension, 'InvalidPriorityFee');
    });

    it('50 gwei base, 25 gwei priority should work', async function () {
        const { order, owner, postInteractionData, settlementExtension } = await loadFixture(prepare);

        await network.provider.send('hardhat_setNextBlockBaseFeePerGas', ['0xba43b7400']); // 50 gwei

        await sendPostInteractionTxn(settlementExtension, order, owner, postInteractionData, 25000000000);
    });

    it('50 gwei base, 26 gwei priority should not work', async function () {
        const { order, owner, postInteractionData, settlementExtension } = await loadFixture(prepare);

        await network.provider.send('hardhat_setNextBlockBaseFeePerGas', ['0xba43b7400']); // 50 gwei

        const postInteractionTxn = sendPostInteractionTxn(settlementExtension, order, owner, postInteractionData, 26000000000);
        await expect(postInteractionTxn).to.be.revertedWithCustomError(settlementExtension, 'InvalidPriorityFee');
    });

    it('150 gwei base, 90 gwei priority should work', async function () {
        const { order, owner, postInteractionData, settlementExtension } = await loadFixture(prepare);

        await network.provider.send('hardhat_setNextBlockBaseFeePerGas', ['0x22ecb25c00']); // 150 gwei

        await sendPostInteractionTxn(settlementExtension, order, owner, postInteractionData, 90000000000);
    });

    it('150 gwei base, 100 gwei priority should not work', async function () {
        const { order, owner, postInteractionData, settlementExtension } = await loadFixture(prepare);

        await network.provider.send('hardhat_setNextBlockBaseFeePerGas', ['0x22ecb25c00']); // 150 gwei

        const postInteractionTxn = sendPostInteractionTxn(settlementExtension, order, owner, postInteractionData, 100000000000);
        await expect(postInteractionTxn).to.be.revertedWithCustomError(settlementExtension, 'InvalidPriorityFee');
    });
});
