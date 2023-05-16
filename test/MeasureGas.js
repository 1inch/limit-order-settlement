const hre = require('hardhat');
const { ethers } = hre;
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { expect, ether, trim0x } = require('@1inch/solidity-utils');
const { deploySwapTokens, getChainId, deployContract } = require('./helpers/fixtures');
const { buildOrder, signOrder, compactSignature, fillWithMakingAmount, buildMakerTraits } = require('@1inch/limit-order-protocol-contract/test/helpers/orderUtils');
const { buildFusions } = require('./helpers/fusionUtils');

describe('MeasureGas', function () {
    const resolversNumber = 10;
    let addrs;
    let chainId;
    const abiCoder = ethers.utils.defaultAbiCoder;

    before(async function () {
        if (hre.__SOLIDITY_COVERAGE_RUNNING) { this.skip(); }
        chainId = await getChainId();
        addrs = await ethers.getSigners();
    });

    async function initContracts() {
        const { dai, weth, inch, swap } = await deploySwapTokens();

        await dai.transfer(addrs[1].address, ether('100'));
        await inch.mint(addrs[0].address, ether('100'));
        await weth.deposit({ value: ether('1') });
        await weth.connect(addrs[1]).deposit({ value: ether('1') });

        const settlement = await deployContract('Settlement', [swap.address, inch.address]);
        const resolvers = [];
        for (let i = 0; i < resolversNumber; i++) {
            resolvers[i] = await deployContract('ResolverMock', [settlement.address, swap.address]);
        }
        const FeeBank = await ethers.getContractFactory('FeeBank');
        const feeBank = FeeBank.attach(await settlement.feeBank());
        await inch.approve(feeBank.address, ether('100'));
        await feeBank.depositFor(resolvers[0].address, ether('100'));

        return { dai, weth, swap, settlement, feeBank, resolvers };
    }

    async function initContractsAndApproves() {
        const { dai, weth, swap, settlement, feeBank, resolvers } = await initContracts();
        await dai.approve(swap.address, ether('100'));
        await dai.connect(addrs[1]).approve(swap.address, ether('100'));
        await weth.approve(swap.address, ether('1'));
        await weth.connect(addrs[1]).approve(swap.address, ether('1'));
        return { dai, weth, swap, settlement, feeBank, resolvers };
    }

    it('1 fill for 1 order', async function () {
        const { dai, weth, swap, settlement, resolvers } = await loadFixture(initContractsAndApproves);

        const { fusions: [fusionDetails], hashes: [fusionDetailsHash], resolvers: fusionResolvers } = await buildFusions([
            { resolvers: [resolvers[0].address] },
        ]);
        const order = buildOrder({
            maker: addrs[1].address,
            makerAsset: dai.address,
            takerAsset: weth.address,
            makingAmount: ether('100'),
            takingAmount: ether('0.1'),
            makerTraits: buildMakerTraits({ allowedSender: settlement.address }),
        });
        order.salt = fusionDetailsHash;
        const { r, vs } = compactSignature(await signOrder(order, chainId, swap.address, addrs[1]));

        const resolverCalldata = abiCoder.encode(
            ['address[]', 'bytes[]'],
            [
                [weth.address],
                [
                    weth.interface.encodeFunctionData('transferFrom', [
                        addrs[0].address,
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
        await expect(tx).to.changeTokenBalances(dai, [resolvers[0], addrs[1]], [ether('100'), ether('-100')]);
        await expect(tx).to.changeTokenBalances(weth, [addrs[0], addrs[1]], [ether('-0.1'), ether('0.1')]);
    });

    it('1 fill for 5 orders in a batch', async function () {
        const { dai, weth, swap, settlement, resolvers } = await loadFixture(initContractsAndApproves);

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
                maker: addrs[1].address,
                makerAsset: dai.address,
                takerAsset: weth.address,
                makingAmount: ether((i + 1).toString()),
                takingAmount: ether(((i + 1) / 100).toString()),
                makerTraits: buildMakerTraits({ allowedSender: settlement.address }),
            });
            orders[i].salt = fusionHashes[i];
            const { r, vs } = compactSignature(await signOrder(orders[i], chainId, swap.address, addrs[1]));
            signatures[i] = { r, vs };
        }
        orders[4] = buildOrder({
            maker: addrs[0].address,
            makerAsset: weth.address,
            takerAsset: dai.address,
            makingAmount: ether('0.1'), // takingAmount/100
            takingAmount: ether('10'), // (max_i - 1) * max_i / 2
            makerTraits: settlement.address,
        });
        orders[4].salt = fusionHashes[4];
        const { r, vs } = compactSignature(await signOrder(orders[4], chainId, swap.address, addrs[0]));
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
        await expect(tx).to.changeTokenBalances(weth, [addrs[0], addrs[1]], [ether('-0.1'), ether('0.1')]);
        await expect(tx).to.changeTokenBalances(dai, [addrs[0], addrs[1]], [ether('10'), ether('-10')]);
    });
});
