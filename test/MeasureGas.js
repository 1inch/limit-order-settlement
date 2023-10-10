const fs = require('fs');
const hre = require('hardhat');
const path = require('path');
const { ethers } = hre;
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { time, expect, ether, trim0x } = require('@1inch/solidity-utils');
const { deploySwapTokens, getChainId, deployContract } = require('./helpers/fixtures');
const { buildOrder, signOrder, buildTakerTraits, buildMakerTraits } = require('@1inch/limit-order-protocol-contract/test/helpers/orderUtils');
const settlementV1Utils = require('@1inch/limit-order-settlement-v1/test/helpers/orderUtils');

const RESOLVERS_NUMBER = 10;

describe('MeasureGas', function () {
    before(async function () {
        if (hre.__SOLIDITY_COVERAGE_RUNNING) { this.skip(); }
    });

    async function initContracts() {
        const [owner, alice] = await ethers.getSigners();
        const chainId = await getChainId();
        const abiCoder = ethers.utils.defaultAbiCoder;
        const { dai, weth, inch, lopv3, lopv4 } = await deploySwapTokens();

        await dai.transfer(alice.address, ether('100'));
        await inch.mint(owner.address, ether('100'));
        await weth.deposit({ value: ether('1') });
        await weth.connect(alice).deposit({ value: ether('1') });

        const settlementExtension = await deployContract('SettlementExtension', [lopv4.address, inch.address]);
        const SettlementV1 = JSON.parse(fs.readFileSync(path.join(__dirname, '../artifacts-v1/SettlementV1.json'), 'utf8'));
        // const settlement = await deployContract(SettlementV1.abi, [lopv3.address, inch.address]);
        const ContractFactory = await ethers.getContractFactory(SettlementV1.abi, SettlementV1.bytecode);
        const settlement = await ContractFactory.deploy(lopv3.address, inch.address);

        const resolvers = [];
        const ResolverV1Mock = JSON.parse(fs.readFileSync(path.join(__dirname, '../artifacts-v1/ResolverV1Mock.json'), 'utf8'));
        for (let i = 0; i < RESOLVERS_NUMBER; i++) {
            // resolvers[i] = await deployContract(ResolverV1Mock.abi, [settlement.address, lopv3.address]);
            const ResolverMockFactory = await ethers.getContractFactory(ResolverV1Mock.abi, ResolverV1Mock.bytecode);
            resolvers[i] = await ResolverMockFactory.deploy(settlement.address);
        }
        const FeeBank = await ethers.getContractFactory('FeeBank');
        const feeBank = FeeBank.attach(await settlement.feeBank());
        await inch.approve(feeBank.address, ether('100'));
        await feeBank.depositFor(resolvers[0].address, ether('100'));

        return {
            contracts: { dai, weth, lopv3, lopv4, settlement, settlementExtension, feeBank, resolvers },
            accounts: { owner, alice },
            others: { chainId, abiCoder },
        };
    }

    async function initContractsAndApproves() {
        const data = await initContracts();
        const { contracts: { dai, weth, lopv3, lopv4 }, accounts: { alice } } = data;
        for (const swap of [lopv3, lopv4]) {
            await dai.approve(swap.address, ether('100'));
            await dai.connect(alice).approve(swap.address, ether('100'));
            await weth.approve(swap.address, ether('1'));
            await weth.connect(alice).approve(swap.address, ether('1'));
        }
        return data;
    }

    describe('SettlementV1', function () {
        it('1 fill for 1 order', async function () {
            const { contracts: { dai, weth, lopv3, settlement, resolvers }, accounts: { owner, alice }, others: { chainId } } = await loadFixture(initContractsAndApproves);

            const makerAsset = dai.address;
            const takerAsset = weth.address;
            const makingAmount = ether('100');
            const takingAmount = ether('0.1');
            const order = await settlementV1Utils.buildOrder(
                {
                    salt: settlementV1Utils.buildSalt({
                        orderStartTime: await time.latest(),
                        initialStartRate: 0,
                        duration: time.duration.hours(1),
                    }),
                    makerAsset,
                    takerAsset,
                    makingAmount,
                    takingAmount,
                    from: alice.address,
                },
                {
                    whitelistedAddrs: [owner.address, ...(resolvers.map(r => r.address))],
                    whitelistedCutOffs: [0, ...(resolvers.map(r => 0))],
                    publicCutOff: time.duration.minutes(30),
                },
            );
            const signature = await settlementV1Utils.signOrder(order, chainId, lopv3.address, alice);

            const interaction =
                settlement.address +
                '01' +
                trim0x(resolvers[0].address) +
                '0000000000000000000000000000000000000000000000000000000000000000' +
                '';
            await weth.transfer(resolvers[0].address, takingAmount);

            const tx = await settlement.settleOrders(
                '0x' + lopv3.interface.encodeFunctionData('fillOrderTo', [
                    order,
                    signature,
                    interaction,
                    makingAmount,
                    0,
                    takingAmount,
                    resolvers[0].address,
                ]).substring(10),
            );
            console.log(`1 fill for 1 order gasUsed: ${(await tx.wait()).gasUsed}`);
            await expect(tx).to.changeTokenBalances(dai, [resolvers[0], alice], [ether('100'), ether('-100')]);
            await expect(tx).to.changeTokenBalances(weth, [resolvers[0], alice], [ether('-0.1'), ether('0.1')]);
        });

        it('1 fill for 5 orders in a batch', async function () {
            const { contracts: { dai, weth, lopv3, settlement, resolvers }, accounts: { alice, owner }, others: { chainId } } = await loadFixture(initContractsAndApproves);

            const resolverAddresses = resolvers.map(r => r.address);
            const whitelistedCutOffsTmp = resolvers.map(r => 0);

            // Build orders and compact signatures
            const orders = [];
            const signatures = [];
            for (let i = 0; i < 4; i++) {
                orders[i] = await settlementV1Utils.buildOrder(
                    {
                        salt: settlementV1Utils.buildSalt({
                            orderStartTime: await time.latest(),
                            initialStartRate: 0,
                            duration: time.duration.hours(1),
                        }),
                        makerAsset: dai.address,
                        takerAsset: weth.address,
                        makingAmount: ether((i + 1).toString()),
                        takingAmount: ether(((i + 1) / 100).toString()),
                        from: alice.address,
                    },
                    {
                        whitelistedAddrs: [owner.address, ...resolverAddresses],
                        whitelistedCutOffs: [0, ...whitelistedCutOffsTmp],
                        publicCutOff: time.duration.minutes(30),
                    },
                );
                signatures[i] = await settlementV1Utils.signOrder(orders[i], chainId, lopv3.address, alice);
            }
            orders[4] = await settlementV1Utils.buildOrder(
                {
                    salt: settlementV1Utils.buildSalt({
                        orderStartTime: await time.latest(),
                        initialStartRate: 0,
                        duration: time.duration.hours(1),
                    }),
                    makerAsset: weth.address,
                    takerAsset: dai.address,
                    makingAmount: ether('0.11'), // takingAmount/100 * 1.1
                    takingAmount: ether('1'), // (max_i - 1) * max_i / 2
                    from: owner.address,
                },
                {
                    whitelistedAddrs: [owner.address, ...resolverAddresses],
                    whitelistedCutOffs: [0, ...whitelistedCutOffsTmp],
                    publicCutOff: time.duration.minutes(30),
                },
            );
            signatures[4] = await settlementV1Utils.signOrder(orders[4], chainId, lopv3.address, owner);

            // Encode data for fillingg orders
            const fillOrdersToData = [];

            fillOrdersToData[5] = settlement.address + '01' + trim0x(resolvers[0].address) + '0000000000000000000000000000000000000000000000000000000000000000';
            fillOrdersToData[4] =
                settlement.address +
                '00' +
                lopv3.interface
                    .encodeFunctionData('fillOrderTo', [
                        orders[4],
                        signatures[4],
                        fillOrdersToData[5],
                        ether('0.11'),
                        0,
                        ether('10'),
                        resolvers[0].address,
                    ])
                    .substring(10);
            for (let i = 3; i >= 1; i--) {
                fillOrdersToData[i] =
                    settlement.address +
                    '00' +
                    lopv3.interface
                        .encodeFunctionData('fillOrderTo', [
                            orders[i],
                            signatures[i],
                            fillOrdersToData[i + 1],
                            ether((i + 1).toString()),
                            0,
                            ether(((i + 1) / 100).toString()),
                            resolvers[0].address,
                        ])
                        .substring(10);
            }

            const tx = await settlement.settleOrders(
                '0x' + lopv3.interface.encodeFunctionData('fillOrderTo', [
                    orders[0],
                    signatures[0],
                    fillOrdersToData[1],
                    ether('1'),
                    0,
                    ether('0.01'),
                    resolvers[0].address, // settlement.address,
                ]).substring(10),
            );
            console.log(`1 fill for 5 orders in a batch gasUsed: ${(await tx.wait()).gasUsed}`);
            await expect(tx).to.changeTokenBalances(weth, [owner, alice], [ether('-0.11'), ether('0.1')]);
            await expect(tx).to.changeTokenBalances(dai, [owner, alice, resolvers[0]], [ether('1'), ether('-10'), ether('9')]);
        });
    });

    describe('SettlementExtension', function () {
        it('extension 1 fill for 1 order', async function () {
            const { contracts: { dai, weth, lopv4, settlementExtension }, accounts: { owner, alice }, others: { chainId } } = await loadFixture(initContractsAndApproves);

            const auctionStartTime = await time.latest();
            const auctionDetails = ethers.utils.solidityPack(
                ['uint32', 'uint24', 'uint24'], [auctionStartTime, time.duration.hours(1), 0],
            );

            const order = buildOrder({
                maker: alice.address,
                makerAsset: dai.address,
                takerAsset: weth.address,
                makingAmount: ether('100'),
                takingAmount: ether('0.1'),
                makerTraits: buildMakerTraits(),
            }, {
                makingAmountData: settlementExtension.address + trim0x(auctionDetails),
                takingAmountData: settlementExtension.address + trim0x(auctionDetails),
                postInteraction: settlementExtension.address + trim0x(ethers.utils.solidityPack(
                    ['uint8', 'uint32', 'bytes10', 'uint16'], [0, auctionStartTime, '0x' + owner.address.substring(22), 0],
                )),
            });

            const { r, _vs: vs } = ethers.utils.splitSignature(await signOrder(order, chainId, lopv4.address, alice));

            await weth.approve(lopv4.address, ether('0.1'));

            const takerTraits = buildTakerTraits({
                makingAmount: true,
                minReturn: ether('0.1'),
                extension: order.extension,
            });

            const tx = await lopv4.fillOrderArgs(
                order,
                r,
                vs,
                ether('100'),
                takerTraits.traits,
                takerTraits.args,
            );
            console.log(`1 fill for 1 order gasUsed: ${(await tx.wait()).gasUsed}`);
            await expect(tx).to.changeTokenBalances(dai, [owner, alice], [ether('100'), ether('-100')]);
            await expect(tx).to.changeTokenBalances(weth, [owner, alice], [ether('-0.1'), ether('0.1')]);
        });
    });
});
