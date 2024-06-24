const fs = require('fs');
const hre = require('hardhat');
const path = require('path');
const { ethers } = hre;
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { constants, time, expect, ether, trim0x, deployContract } = require('@1inch/solidity-utils');
const { deploySwapTokens, getChainId } = require('./helpers/fixtures');
const { buildAuctionDetails, buildExtensionsBitmapData } = require('./helpers/fusionUtils');
const { buildOrder: buildOrderV1, buildSalt: buildSaltV1, signOrder: signOrderV1 } = require('./helpers/orderUtilsV1');
const { buildOrder, signOrder, buildTakerTraits, buildMakerTraits } = require('@1inch/limit-order-protocol-contract/test/helpers/orderUtils');

const RESOLVERS_NUMBER = 10;

describe('MeasureGas', function () {
    before(async function () {
        if (hre.__SOLIDITY_COVERAGE_RUNNING) { this.skip(); }
    });

    async function initContracts() {
        const [owner, alice] = await ethers.getSigners();
        const chainId = await getChainId();
        const abiCoder = ethers.AbiCoder.defaultAbiCoder();
        const { dai, weth, inch, accessToken, lopv3, lopv4 } = await deploySwapTokens();

        await dai.transfer(alice, ether('100'));
        await inch.mint(owner, ether('100'));
        await weth.deposit({ value: ether('1') });
        await weth.connect(alice).deposit({ value: ether('1') });

        const settlementExtension = await deployContract('Settlement', [lopv4, inch, accessToken, weth, owner]);
        const SettlementV1 = JSON.parse(fs.readFileSync(path.join(__dirname, '../artifacts-v1/SettlementV1.json'), 'utf8'));
        // const settlement = await deployContract(SettlementV1.abi, [lopv3.address, inch.address]);
        const ContractFactory = await ethers.getContractFactory(SettlementV1.abi, SettlementV1.bytecode);
        const settlement = await ContractFactory.deploy(lopv3, inch);

        const resolversV1 = [];
        const ResolverV1Mock = JSON.parse(fs.readFileSync(path.join(__dirname, '../artifacts-v1/ResolverV1Mock.json'), 'utf8'));
        for (let i = 0; i < RESOLVERS_NUMBER; i++) {
            const ResolverMockFactory = await ethers.getContractFactory(ResolverV1Mock.abi, ResolverV1Mock.bytecode);
            resolversV1[i] = await ResolverMockFactory.deploy(settlement);
        }
        const FeeBank = await ethers.getContractFactory('FeeBank');
        const feeBank = FeeBank.attach(await settlement.feeBank());
        await inch.approve(feeBank, ether('100'));
        await feeBank.depositFor(resolversV1[0], ether('100'));

        const ResolverMock = await ethers.getContractFactory('ResolverMock');
        const resolver = await ResolverMock.deploy(settlement, lopv4);
        await resolver.approve(dai, lopv4);
        await resolver.approve(weth, lopv4);

        return {
            contracts: { dai, weth, accessToken, lopv3, lopv4, settlement, settlementExtension, feeBank, resolversV1, resolver },
            accounts: { owner, alice },
            others: { chainId, abiCoder },
        };
    }

    async function initContractsAndApproves() {
        const data = await initContracts();
        const { contracts: { dai, weth, lopv3, lopv4 }, accounts: { alice } } = data;
        for (const swap of [lopv3, lopv4]) {
            await dai.approve(swap, ether('100'));
            await dai.connect(alice).approve(swap, ether('100'));
            await weth.approve(swap, ether('1'));
            await weth.connect(alice).approve(swap, ether('1'));
        }
        return data;
    }

    describe('SettlementV1', function () {
        it('1 fill for 1 order', async function () {
            const { contracts: { dai, weth, lopv3, settlement, resolversV1 }, accounts: { owner, alice }, others: { chainId } } = await loadFixture(initContractsAndApproves);

            const makerAsset = await dai.getAddress();
            const takerAsset = await weth.getAddress();
            const makingAmount = ether('100');
            const takingAmount = ether('0.1');
            const order = await buildOrderV1(
                {
                    salt: buildSaltV1({
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
                    whitelistedAddrs: [owner.address, ...(resolversV1.map(r => r.target))],
                    whitelistedCutOffs: [0, ...(resolversV1.map(r => 0))],
                    publicCutOff: time.duration.minutes(30),
                },
            );
            const signature = await signOrderV1(order, chainId, await lopv3.getAddress(), alice);

            const interaction =
                await settlement.getAddress() +
                '01' +
                trim0x(await resolversV1[0].getAddress()) +
                '0000000000000000000000000000000000000000000000000000000000000000' +
                '';
            await weth.transfer(resolversV1[0], takingAmount);

            const tx = await settlement.settleOrders(
                '0x' + lopv3.interface.encodeFunctionData('fillOrderTo', [
                    order,
                    signature,
                    interaction,
                    makingAmount,
                    0,
                    takingAmount,
                    await resolversV1[0].getAddress(),
                ]).substring(10),
            );
            console.log(`1 fill for 1 order gasUsed: ${(await tx.wait()).gasUsed}`);
            await expect(tx).to.changeTokenBalances(dai, [resolversV1[0], alice], [ether('100'), ether('-100')]);
            await expect(tx).to.changeTokenBalances(weth, [resolversV1[0], alice], [ether('-0.1'), ether('0.1')]);
        });

        it('1 fill for 5 orders in a batch', async function () {
            const { contracts: { dai, weth, lopv3, settlement, resolversV1 }, accounts: { alice, owner }, others: { chainId } } = await loadFixture(initContractsAndApproves);

            const resolverAddresses = resolversV1.map(r => r.target);
            const whitelistedCutOffsTmp = resolversV1.map(r => 0);

            // Build orders and compact signatures
            const orders = [];
            const signatures = [];
            for (let i = 0; i < 4; i++) {
                orders[i] = await buildOrderV1(
                    {
                        salt: buildSaltV1({
                            orderStartTime: await time.latest(),
                            initialStartRate: 0,
                            duration: time.duration.hours(1),
                        }),
                        makerAsset: await dai.getAddress(),
                        takerAsset: await weth.getAddress(),
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
                signatures[i] = await signOrderV1(orders[i], chainId, await lopv3.getAddress(), alice);
            }
            orders[4] = await buildOrderV1(
                {
                    salt: buildSaltV1({
                        orderStartTime: await time.latest(),
                        initialStartRate: 0,
                        duration: time.duration.hours(1),
                    }),
                    makerAsset: await weth.getAddress(),
                    takerAsset: await dai.getAddress(),
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
            signatures[4] = await signOrderV1(orders[4], chainId, await lopv3.getAddress(), owner);

            // Encode data for fillingg orders
            const fillOrdersToData = [];

            fillOrdersToData[5] = await settlement.getAddress() + '01' + trim0x(resolversV1[0].target) + '0000000000000000000000000000000000000000000000000000000000000000';
            fillOrdersToData[4] =
                await settlement.getAddress() +
                '00' +
                lopv3.interface
                    .encodeFunctionData('fillOrderTo', [
                        orders[4],
                        signatures[4],
                        fillOrdersToData[5],
                        ether('0.11'),
                        0,
                        ether('10'),
                        await resolversV1[0].getAddress(),
                    ])
                    .substring(10);
            for (let i = 3; i >= 1; i--) {
                fillOrdersToData[i] =
                    await settlement.getAddress() +
                    '00' +
                    lopv3.interface
                        .encodeFunctionData('fillOrderTo', [
                            orders[i],
                            signatures[i],
                            fillOrdersToData[i + 1],
                            ether((i + 1).toString()),
                            0,
                            ether(((i + 1) / 100).toString()),
                            await resolversV1[0].getAddress(),
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
                    await resolversV1[0].getAddress(), // settlement.address,
                ]).substring(10),
            );
            console.log(`1 fill for 5 orders in a batch gasUsed: ${(await tx.wait()).gasUsed}`);
            await expect(tx).to.changeTokenBalances(weth, [owner, alice], [ether('-0.11'), ether('0.1')]);
            await expect(tx).to.changeTokenBalances(dai, [owner, alice, resolversV1[0]], [ether('1'), ether('-10'), ether('9')]);
        });
    });

    describe('Extension check', function () {
        it('post interaction', async function () {
            const { contracts: { dai, weth, accessToken }, accounts: { owner } } = await loadFixture(initContractsAndApproves);
            const settlementExtension = await deployContract('Settlement', [owner, weth, accessToken, weth, owner]);
            const currentTime = (await time.latest()) - time.duration.minutes(1);

            const postInteractionData = ethers.solidityPacked(
                ['uint32', 'bytes10', 'uint16', 'bytes10', 'uint16', 'bytes10', 'uint16', 'bytes10', 'uint16', 'bytes10', 'uint16', 'bytes1'],
                [
                    currentTime,
                    '0x' + weth.target.substring(22), 0,
                    '0x' + weth.target.substring(22), 0,
                    '0x' + weth.target.substring(22), 0,
                    '0x' + owner.address.substring(22), 0,
                    '0x' + weth.target.substring(22), 0,
                    buildExtensionsBitmapData({ resolvers: 5 }),
                ],
            );

            const order = buildOrder({
                maker: owner.address,
                makerAsset: await dai.getAddress(),
                takerAsset: await weth.getAddress(),
                makingAmount: ether('10'),
                takingAmount: ether('1'),
                makerTraits: buildMakerTraits(),
            }, {
                postInteraction: await settlementExtension.getAddress() + trim0x(postInteractionData),
            });

            await settlementExtension.postInteraction(order, '0x', constants.ZERO_BYTES32, owner.address, ether('10'), ether('1'), ether('10'), postInteractionData);
        });

        it('making getter', async function () {
            const { contracts: { dai, weth, settlementExtension }, accounts: { owner } } = await loadFixture(initContractsAndApproves);

            const currentTime = await time.latest();
            const { details } = await buildAuctionDetails({
                startTime: currentTime - time.duration.minutes(5),
                initialRateBump: 900000,
                points: [[800000, 100], [700000, 100], [600000, 100], [500000, 100], [400000, 100]],
            });

            const order = buildOrder({
                maker: owner.address,
                makerAsset: await dai.getAddress(),
                takerAsset: await weth.getAddress(),
                makingAmount: ether('10'),
                takingAmount: ether('1'),
                makerTraits: buildMakerTraits(),
            }, {
                makingAmountData: await settlementExtension.getAddress() + trim0x(details),
                takingAmountData: await settlementExtension.getAddress() + trim0x(details),
            });

            const txn = await settlementExtension.getMakingAmount.populateTransaction(order, '0x', constants.ZERO_BYTES32, constants.ZERO_ADDRESS, ether('1'), ether('10'), details);
            await owner.sendTransaction(txn);
        });
    });

    describe('SettlementExtension', function () {
        it('extension 1 fill for 1 order', async function () {
            const { contracts: { dai, weth, lopv4, settlementExtension }, accounts: { owner, alice }, others: { chainId } } = await loadFixture(initContractsAndApproves);

            const auctionStartTime = await time.latest();
            const { details: auctionDetails } = await buildAuctionDetails({ startTime: auctionStartTime, duration: time.duration.hours(1) });

            const order = buildOrder({
                maker: alice.address,
                makerAsset: await dai.getAddress(),
                takerAsset: await weth.getAddress(),
                makingAmount: ether('100'),
                takingAmount: ether('0.1'),
                makerTraits: buildMakerTraits(),
            }, {
                makingAmountData: await settlementExtension.getAddress() + trim0x(auctionDetails),
                takingAmountData: await settlementExtension.getAddress() + trim0x(auctionDetails),
                postInteraction: await settlementExtension.getAddress() + trim0x(ethers.solidityPacked(
                    ['uint32', 'bytes10', 'uint16', 'bytes1'], [auctionStartTime, '0x' + owner.address.substring(22), 0, buildExtensionsBitmapData()],
                )),
            });

            const { r, yParityAndS: vs } = ethers.Signature.from(await signOrder(order, chainId, await lopv4.getAddress(), alice));
            await weth.approve(lopv4, ether('0.1'));

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

        it('extension 1 fill for 1 order via resolver with funds', async function () {
            const { contracts: { dai, weth, lopv4, settlementExtension, resolver }, accounts: { alice }, others: { chainId } } = await loadFixture(initContractsAndApproves);

            const auctionStartTime = await time.latest();
            const { details: auctionDetails } = await buildAuctionDetails({ startTime: auctionStartTime, duration: time.duration.hours(1) });

            const order = buildOrder({
                maker: alice.address,
                makerAsset: await dai.getAddress(),
                takerAsset: await weth.getAddress(),
                makingAmount: ether('100'),
                takingAmount: ether('0.1'),
                makerTraits: buildMakerTraits(),
            }, {
                makingAmountData: await settlementExtension.getAddress() + trim0x(auctionDetails),
                takingAmountData: await settlementExtension.getAddress() + trim0x(auctionDetails),
                postInteraction: await settlementExtension.getAddress() + trim0x(ethers.solidityPacked(
                    ['uint32', 'bytes10', 'uint16', 'bytes1'], [auctionStartTime, '0x' + resolver.target.substring(22), 0, buildExtensionsBitmapData()],
                )),
            });

            const { r, yParityAndS: vs } = ethers.Signature.from(await signOrder(order, chainId, await lopv4.getAddress(), alice));

            const takerTraits = buildTakerTraits({
                makingAmount: true,
                minReturn: ether('100'),
                extension: order.extension,
            });

            await weth.transfer(resolver, ether('0.1'));

            const tx = await resolver.settleOrders(
                lopv4.interface.encodeFunctionData('fillOrderArgs', [
                    order,
                    r,
                    vs,
                    ether('100'),
                    takerTraits.traits,
                    takerTraits.args,
                ]),
            );
            console.log(`1 fill for 1 order via resolver with funds gasUsed: ${(await tx.wait()).gasUsed}`);
            await expect(tx).to.changeTokenBalances(dai, [resolver, alice], [ether('100'), ether('-100')]);
            await expect(tx).to.changeTokenBalances(weth, [resolver, alice], [ether('-0.1'), ether('0.1')]);
        });

        it('extension 1 fill for 1 order via resolver without funds', async function () {
            const { contracts: { dai, weth, lopv4, settlementExtension, resolver }, accounts: { owner, alice }, others: { chainId, abiCoder } } = await loadFixture(initContractsAndApproves);

            const auctionStartTime = await time.latest();
            const { details: auctionDetails } = await buildAuctionDetails({ startTime: auctionStartTime, duration: time.duration.hours(1) });

            const resolverArgs = abiCoder.encode(
                ['address[]', 'bytes[]'],
                [
                    [await weth.getAddress()],
                    [
                        weth.interface.encodeFunctionData('transferFrom', [
                            owner.address,
                            await resolver.getAddress(),
                            ether('0.1'),
                        ]),
                    ],
                ],
            );

            const order = buildOrder({
                maker: alice.address,
                makerAsset: await dai.getAddress(),
                takerAsset: await weth.getAddress(),
                makingAmount: ether('100'),
                takingAmount: ether('0.1'),
                makerTraits: buildMakerTraits(),
            }, {
                makingAmountData: await settlementExtension.getAddress() + trim0x(auctionDetails),
                takingAmountData: await settlementExtension.getAddress() + trim0x(auctionDetails),
                postInteraction: await settlementExtension.getAddress() + trim0x(ethers.solidityPacked(
                    ['uint32', 'bytes10', 'uint16', 'bytes1'], [auctionStartTime, '0x' + resolver.target.substring(22), 0, buildExtensionsBitmapData()],
                )),
            });

            const { r, yParityAndS: vs } = ethers.Signature.from(await signOrder(order, chainId, await lopv4.getAddress(), alice));

            const takerTraits = buildTakerTraits({
                makingAmount: true,
                minReturn: ether('100'),
                extension: order.extension,
                interaction: await resolver.getAddress() + '01' + trim0x(resolverArgs),
            });

            await weth.approve(resolver, ether('0.1'));

            const tx = await resolver.settleOrders(
                lopv4.interface.encodeFunctionData('fillOrderArgs', [
                    order,
                    r,
                    vs,
                    ether('100'),
                    takerTraits.traits,
                    takerTraits.args,
                ]),
            );
            console.log(`1 fill for 1 order via resolver without money gasUsed: ${(await tx.wait()).gasUsed}`);
            await expect(tx).to.changeTokenBalances(dai, [resolver, alice], [ether('100'), ether('-100')]);
            await expect(tx).to.changeTokenBalances(weth, [owner, alice], [ether('-0.1'), ether('0.1')]);
        });
    });
});
