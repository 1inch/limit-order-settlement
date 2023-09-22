const hre = require('hardhat');
const { ethers } = hre;
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { expect, ether, trim0x } = require('@1inch/solidity-utils');
const { deploySwapTokens, getChainId, deployContract } = require('./helpers/fixtures');
const { buildOrder, signOrder, compactSignature, fillWithMakingAmount, buildMakerTraits } = require('@1inch/limit-order-protocol-contract/test/helpers/orderUtils');
const { buildFusions } = require('./helpers/fusionUtils');

const RESOLVERS_NUMBER = 10;

describe('MeasureGas', function () {
    before(async function () {
        if (hre.__SOLIDITY_COVERAGE_RUNNING) { this.skip(); }
    });

    async function initContracts() {
        const [owner, alice] = await ethers.getSigners();
        const chainId = await getChainId();
        const abiCoder = ethers.utils.defaultAbiCoder;
        const { dai, weth, inch, swap } = await deploySwapTokens();

        await dai.transfer(alice.address, ether('100'));
        await inch.mint(owner.address, ether('100'));
        await weth.deposit({ value: ether('1') });
        await weth.connect(alice).deposit({ value: ether('1') });

        const settlement = await deployContract('Settlement', [swap.address, inch.address]);
        const resolvers = [];
        for (let i = 0; i < RESOLVERS_NUMBER; i++) {
            resolvers[i] = await deployContract('ResolverMock', [settlement.address, swap.address]);
        }
        const FeeBank = await ethers.getContractFactory('FeeBank');
        const feeBank = FeeBank.attach(await settlement.feeBank());
        await inch.approve(feeBank.address, ether('100'));
        await feeBank.depositFor(resolvers[0].address, ether('100'));

        return {
            contracts: { dai, weth, swap, settlement, feeBank, resolvers },
            accounts: { owner, alice },
            others: { chainId, abiCoder },
        };
    }

    async function initContractsAndApproves() {
        const data = await initContracts();
        const { contracts: { dai, weth, swap }, accounts: { alice } } = data;
        await dai.approve(swap.address, ether('100'));
        await dai.connect(alice).approve(swap.address, ether('100'));
        await weth.approve(swap.address, ether('1'));
        await weth.connect(alice).approve(swap.address, ether('1'));
        return data;
    }

    it('1 fill for 1 order', async function () {
        const { contracts: { dai, weth, swap, settlement, resolvers }, accounts: { owner, alice }, others: { chainId, abiCoder } } = await loadFixture(initContractsAndApproves);

        const { fusions: [fusionDetails], hashes: [fusionDetailsHash], resolvers: fusionResolvers } = await buildFusions([
            { resolvers: [resolvers[0].address] },
        ]);
        const order = buildOrder({
            maker: alice.address,
            makerAsset: dai.address,
            takerAsset: weth.address,
            makingAmount: ether('100'),
            takingAmount: ether('0.1'),
            makerTraits: buildMakerTraits({ allowedSender: settlement.address }),
        });
        order.salt = fusionDetailsHash;
        const { r, vs } = compactSignature(await signOrder(order, chainId, swap.address, alice));

        const resolverCalldata = abiCoder.encode(
            ['address[]', 'bytes[]'],
            [
                [weth.address],
                [
                    weth.interface.encodeFunctionData('transferFrom', [
                        owner.address,
                        resolvers[0].address,
                        ether('0.1'),
                    ]),
                ],
            ],
        );

        const fillOrderToData = swap.interface.encodeFunctionData('fillOrderTo', [
            order,
            r,
            vs,
            ether('100'),
            fillWithMakingAmount('0'),
            resolvers[0].address,
            settlement.address + '01' + trim0x(fusionDetails) + trim0x(resolverCalldata),
        ]) + trim0x(fusionResolvers);

        await weth.approve(resolvers[0].address, ether('0.1'));

        const tx = await resolvers[0].settleOrders(fillOrderToData);
        console.log(`1 fill for 1 order gasUsed: ${(await tx.wait()).gasUsed}`);
        await expect(tx).to.changeTokenBalances(dai, [resolvers[0], alice], [ether('100'), ether('-100')]);
        await expect(tx).to.changeTokenBalances(weth, [owner, alice], [ether('-0.1'), ether('0.1')]);
    });

    it('1 fill for 5 orders in a batch', async function () {
        const { contracts: { dai, weth, swap, settlement, resolvers }, accounts: { alice, owner }, others: { chainId } } = await loadFixture(initContractsAndApproves);

        const resolverAddresses = resolvers.map(r => r.address);
        const { fusions: fusionDetails, hashes: fusionHashes, resolvers: fusionResolvers } = await buildFusions([
            { resolvers: resolverAddresses },
            { resolvers: resolverAddresses },
            { resolvers: resolverAddresses },
            { resolvers: resolverAddresses },
            { resolvers: resolverAddresses },
        ]);

        // Build orders and compact signatures
        const orders = [];
        const signatures = [];
        for (let i = 0; i < 4; i++) {
            orders[i] = buildOrder({
                maker: alice.address,
                makerAsset: dai.address,
                takerAsset: weth.address,
                makingAmount: ether((i + 1).toString()),
                takingAmount: ether(((i + 1) / 100).toString()),
                makerTraits: buildMakerTraits({ allowedSender: settlement.address }),
            });
            orders[i].salt = fusionHashes[i];
            const { r, vs } = compactSignature(await signOrder(orders[i], chainId, swap.address, alice));
            signatures[i] = { r, vs };
        }
        orders[4] = buildOrder({
            maker: owner.address,
            makerAsset: weth.address,
            takerAsset: dai.address,
            makingAmount: ether('0.1'), // takingAmount/100
            takingAmount: ether('10'), // (max_i - 1) * max_i / 2
            makerTraits: settlement.address,
        });
        orders[4].salt = fusionHashes[4];
        const { r, vs } = compactSignature(await signOrder(orders[4], chainId, swap.address, owner));
        signatures[4] = { r, vs };

        // Encode data for fillingg orders
        const fillOrdersToData = [];
        fillOrdersToData[4] = swap.interface.encodeFunctionData('fillOrderTo', [
            orders[4],
            signatures[4].r,
            signatures[4].vs,
            ether('0.1'),
            fillWithMakingAmount('0'),
            resolvers[0].address,
            settlement.address + '01' + trim0x(fusionDetails[4]),
        ]);
        for (let i = 3; i >= 0; i--) {
            fillOrdersToData[i] = swap.interface.encodeFunctionData('fillOrderTo', [
                orders[i],
                signatures[i].r,
                signatures[i].vs,
                ether((i + 1).toString()),
                fillWithMakingAmount('0'),
                resolvers[0].address,
                settlement.address + '00' + trim0x(fusionDetails[i]) + trim0x(fillOrdersToData[i + 1]),
            ]);
        }
        fillOrdersToData[0] += trim0x(fusionResolvers);

        const tx = await resolvers[0].settleOrders(fillOrdersToData[0]);
        console.log(`1 fill for 5 orders in a batch gasUsed: ${(await tx.wait()).gasUsed}`);
        await expect(tx).to.changeTokenBalances(weth, [owner, alice], [ether('-0.1'), ether('0.1')]);
        await expect(tx).to.changeTokenBalances(dai, [owner, alice], [ether('10'), ether('-10')]);
    });
});
