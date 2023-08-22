const { time, expect, ether, trim0x, timeIncreaseTo, getPermit, getPermit2, compressPermit, permit2Contract } = require('@1inch/solidity-utils');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { ethers } = require('hardhat');
const { deploySwapTokens, getChainId } = require('./helpers/fixtures');
const { buildOrder, signOrder, compactSignature, fillWithMakingAmount, buildMakerTraits } = require('@1inch/limit-order-protocol-contract/test/helpers/orderUtils');
const { buildFusion } = require('./helpers/fusionUtils');

describe('Settlement', function () {
    async function initContracts() {
        const basePoints = ether('0.001'); // 1e15
        const orderFee = 100n;
        const backOrderFee = 125n;
        const abiCoder = ethers.utils.defaultAbiCoder;
        const chainId = await getChainId();
        const [addr, addr1, addr2] = await ethers.getSigners();

        const { dai, weth, inch, swap } = await deploySwapTokens();

        await dai.transfer(addr1.address, ether('100'));
        await inch.mint(addr.address, ether('100'));
        await weth.deposit({ value: ether('1') });
        await weth.connect(addr1).deposit({ value: ether('1') });

        const SettlementMock = await ethers.getContractFactory('SettlementMock');
        const settlement = await SettlementMock.deploy(swap.address, inch.address);
        await settlement.deployed();

        const FeeBank = await ethers.getContractFactory('FeeBank');
        const feeBank = await FeeBank.attach(await settlement.feeBank());

        const ResolverMock = await ethers.getContractFactory('ResolverMock');
        const resolver = await ResolverMock.deploy(settlement.address, swap.address);

        await inch.approve(feeBank.address, ether('100'));
        await feeBank.depositFor(resolver.address, ether('100'));

        await dai.approve(swap.address, ether('100'));
        await dai.connect(addr1).approve(swap.address, ether('100'));
        await weth.approve(swap.address, ether('1'));
        await weth.connect(addr1).approve(swap.address, ether('1'));

        return {
            contracts: { dai, weth, swap, settlement, feeBank, resolver },
            accounts: { addr, addr1, addr2 },
            other: { chainId, abiCoder, basePoints, orderFee, backOrderFee },
        };
    }

    async function buildCalldataForOrder({
        orderData,
        singleFusionData,
        orderSigner,
        dataFormFixture,
        additionalDataForSettlement = '',
        isInnermostOrder = false,
        fillingAmount = orderData.makingAmount,
    }) {
        const {
            contracts: { swap, settlement, resolver },
            other: { chainId },
        } = dataFormFixture;
        const fusionDetails = await buildFusion(singleFusionData);
        const order = buildOrder(orderData, { customData: fusionDetails });
        const { r, vs } = compactSignature(await signOrder(order, chainId, swap.address, orderSigner));
        return swap.interface.encodeFunctionData('fillOrderToExt', [
            order,
            r,
            vs,
            fillingAmount,
            fillWithMakingAmount('0'),
            resolver.address,
            order.extension,
            settlement.address + (isInnermostOrder ? '01' : '00') + trim0x(additionalDataForSettlement),
        ]);
    }

    it('opposite direction recursive swap', async function () {
        const dataFormFixture = await loadFixture(initContracts);
        const {
            contracts: { dai, weth, settlement, resolver },
            accounts: { addr, addr1 },
        } = dataFormFixture;

        const fillOrderToData1 = await buildCalldataForOrder({
            orderData: {
                maker: addr1.address,
                makerAsset: weth.address,
                takerAsset: dai.address,
                makingAmount: ether('0.11'),
                takingAmount: ether('100'),
                makerTraits: buildMakerTraits({ allowedSender: settlement.address }),
            },
            singleFusionData: { resolvers: [resolver.address] },
            orderSigner: addr1,
            dataFormFixture,
            isInnermostOrder: true,
        });

        const fillOrderToData0 = await buildCalldataForOrder({
            orderData: {
                maker: addr.address,
                makerAsset: dai.address,
                takerAsset: weth.address,
                makingAmount: ether('100'),
                takingAmount: ether('0.11'),
                makerTraits: buildMakerTraits({ allowedSender: settlement.address }),
            },
            singleFusionData: { resolvers: [resolver.address] },
            orderSigner: addr,
            dataFormFixture,
            additionalDataForSettlement: fillOrderToData1,
        });

        const txn = await resolver.settleOrders(fillOrderToData0);
        await expect(txn).to.changeTokenBalances(dai, [addr, addr1], [ether('-100'), ether('100')]);
        await expect(txn).to.changeTokenBalances(weth, [addr, addr1], [ether('0.11'), ether('-0.11')]);
    });

    it('settle orders with permits, permit', async function () {
        const dataFormFixture = await loadFixture(initContracts);
        const {
            contracts: { dai, weth, swap, settlement, resolver },
            accounts: { addr, addr1 },
            other: { chainId },
        } = dataFormFixture;

        const fillOrderToData1 = await buildCalldataForOrder({
            orderData: {
                maker: addr1.address,
                makerAsset: weth.address,
                takerAsset: dai.address,
                makingAmount: ether('0.11'),
                takingAmount: ether('100'),
                makerTraits: buildMakerTraits({ allowedSender: settlement.address }),
            },
            singleFusionData: { resolvers: [resolver.address] },
            orderSigner: addr1,
            dataFormFixture,
            isInnermostOrder: true,
        });

        const fillOrderToData0 = await buildCalldataForOrder({
            orderData: {
                maker: addr.address,
                makerAsset: dai.address,
                takerAsset: weth.address,
                makingAmount: ether('100'),
                takingAmount: ether('0.11'),
                makerTraits: buildMakerTraits({ allowedSender: settlement.address }),
            },
            singleFusionData: { resolvers: [resolver.address] },
            orderSigner: addr,
            dataFormFixture,
            additionalDataForSettlement: fillOrderToData1,
        });

        await weth.connect(addr1).approve(swap.address, ether('0.11'));
        await dai.connect(addr).approve(swap.address, 0n); // remove direct approve
        const permit0 = compressPermit(await getPermit(addr, dai, '1', chainId, swap.address, ether('100')));
        const packing = (1n << 248n) | 1n;
        const txn = await resolver.settleOrdersWithPermits(fillOrderToData0, packing,
            addr.address + trim0x(dai.address) + trim0x(permit0));
        await expect(txn).to.changeTokenBalances(dai, [addr, addr1], [ether('-100'), ether('100')]);
        await expect(txn).to.changeTokenBalances(weth, [addr, addr1], [ether('0.11'), ether('-0.11')]);
    });

    it('settle orders with permits, permit2', async function () {
        const dataFormFixture = await loadFixture(initContracts);
        const {
            contracts: { dai, weth, swap, settlement, resolver },
            accounts: { addr, addr1 },
            other: { chainId },
        } = dataFormFixture;

        const fillOrderToData1 = await buildCalldataForOrder({
            orderData: {
                maker: addr1.address,
                makerAsset: weth.address,
                takerAsset: dai.address,
                makingAmount: ether('0.11'),
                takingAmount: ether('100'),
                makerTraits: buildMakerTraits({ allowedSender: settlement.address, usePermit2: true }),
            },
            singleFusionData: { resolvers: [resolver.address] },
            orderSigner: addr1,
            dataFormFixture,
            isInnermostOrder: true,
        });

        const fillOrderToData0 = await buildCalldataForOrder({
            orderData: {
                maker: addr.address,
                makerAsset: dai.address,
                takerAsset: weth.address,
                makingAmount: ether('100'),
                takingAmount: ether('0.11'),
                makerTraits: buildMakerTraits({ allowedSender: settlement.address, usePermit2: true }),
            },
            singleFusionData: { resolvers: [resolver.address] },
            orderSigner: addr,
            dataFormFixture,
            additionalDataForSettlement: fillOrderToData1,
        });

        const permit2 = await permit2Contract();
        await dai.approve(permit2.address, ether('100'));
        await weth.connect(addr1).approve(permit2.address, ether('0.11'));
        await dai.connect(addr).approve(swap.address, 0n); // remove direct approve
        await weth.connect(addr1).approve(swap.address, 0n); // remove direct approve
        const permit0 = compressPermit(await getPermit2(addr, dai.address, chainId, swap.address, ether('100')));
        const permit1 = compressPermit(await getPermit2(addr1, weth.address, chainId, swap.address, ether('0.11')));
        const packing = (2n << 248n) | 2n | 8n;
        const txn = await resolver.settleOrdersWithPermits(fillOrderToData0, packing,
            addr.address + trim0x(dai.address) + trim0x(permit0) + trim0x(addr1.address) + trim0x(weth.address) + trim0x(permit1));
        await expect(txn).to.changeTokenBalances(dai, [addr, addr1], [ether('-100'), ether('100')]);
        await expect(txn).to.changeTokenBalances(weth, [addr, addr1], [ether('0.11'), ether('-0.11')]);
    });

    it('opposite direction recursive swap with taking fee', async function () {
        const dataFormFixture = await loadFixture(initContracts);
        const {
            contracts: { dai, weth, settlement, resolver },
            accounts: { addr, addr1, addr2 },
        } = dataFormFixture;

        const fillOrderToData1 = await buildCalldataForOrder({
            orderData: {
                maker: addr1.address,
                makerAsset: weth.address,
                takerAsset: dai.address,
                makingAmount: ether('0.1'),
                takingAmount: ether('100'),
                makerTraits: buildMakerTraits({ allowedSender: settlement.address }),
            },
            singleFusionData: { resolvers: [resolver.address], takerFee: 10000000n, takerFeeReceiver: addr2.address },
            orderSigner: addr1,
            dataFormFixture,
            isInnermostOrder: true,
        });

        const fillOrderToData0 = await buildCalldataForOrder({
            orderData: {
                maker: addr.address,
                makerAsset: dai.address,
                takerAsset: weth.address,
                makingAmount: ether('100'),
                takingAmount: ether('0.1'),
                makerTraits: buildMakerTraits({ allowedSender: settlement.address }),
            },
            singleFusionData: { resolvers: [resolver.address], takerFee: 10000000n, takerFeeReceiver: addr2.address },
            orderSigner: addr,
            dataFormFixture,
            additionalDataForSettlement: fillOrderToData1,
        });

        const wethFeeAmount = ether('0.001');
        const daiFeeAmount = ether('1');
        // send fee amounts to resolver contract
        await weth.transfer(resolver.address, wethFeeAmount.toString());
        await dai.connect(addr1).transfer(resolver.address, daiFeeAmount.toString());

        const txn = await resolver.settleOrders(fillOrderToData0);
        await expect(txn).to.changeTokenBalances(dai, [addr, addr1, addr2], [ether('-100'), ether('100'), ether('1')]);
        await expect(txn).to.changeTokenBalances(weth, [addr, addr1, addr2], [ether('0.1'), ether('-0.1'), ether('0.001')]);
    });

    it('unidirectional recursive swap', async function () {
        const dataFormFixture = await loadFixture(initContracts);
        const {
            contracts: { dai, weth, settlement, resolver },
            accounts: { addr, addr1 },
            other: { abiCoder },
        } = dataFormFixture;

        const resolverArgs = abiCoder.encode(
            ['address[]', 'bytes[]'],
            [
                [weth.address],
                [
                    weth.interface.encodeFunctionData('transferFrom', [
                        addr.address,
                        resolver.address,
                        ether('0.025'),
                    ]),
                ],
            ],
        );

        const fillOrderToData1 = await buildCalldataForOrder({
            orderData: {
                maker: addr1.address,
                makerAsset: dai.address,
                takerAsset: weth.address,
                makingAmount: ether('15'),
                takingAmount: ether('0.015'),
                makerTraits: buildMakerTraits({ allowedSender: settlement.address }),
            },
            singleFusionData: { resolvers: [resolver.address] },
            orderSigner: addr1,
            dataFormFixture,
            additionalDataForSettlement: resolverArgs,
            isInnermostOrder: true,
        });

        const fillOrderToData0 = await buildCalldataForOrder({
            orderData: {
                maker: addr1.address,
                makerAsset: dai.address,
                takerAsset: weth.address,
                makingAmount: ether('10'),
                takingAmount: ether('0.01'),
                makerTraits: buildMakerTraits({ allowedSender: settlement.address }),
            },
            singleFusionData: { resolvers: [resolver.address] },
            orderSigner: addr1,
            dataFormFixture,
            additionalDataForSettlement: fillOrderToData1,
        });

        await weth.approve(resolver.address, ether('0.025'));

        const txn = await resolver.settleOrders(fillOrderToData0);
        await expect(txn).to.changeTokenBalances(dai, [resolver, addr1], [ether('25'), ether('-25')]);
        await expect(txn).to.changeTokenBalances(weth, [addr, addr1], [ether('-0.025'), ether('0.025')]);
    });

    it('triple recursive swap', async function () {
        const dataFormFixture = await loadFixture(initContracts);
        const {
            contracts: { dai, weth, settlement, resolver },
            accounts: { addr, addr1 },
        } = dataFormFixture;

        const fillOrderToData2 = await buildCalldataForOrder({
            orderData: {
                maker: addr.address,
                makerAsset: weth.address,
                takerAsset: dai.address,
                makingAmount: ether('0.025'),
                takingAmount: ether('25'),
                allowedSender: settlement.address,
            },
            singleFusionData: { resolvers: [resolver.address] },
            orderSigner: addr,
            dataFormFixture,
            isInnermostOrder: true,
        });

        const fillOrderToData1 = await buildCalldataForOrder({
            orderData: {
                maker: addr1.address,
                makerAsset: dai.address,
                takerAsset: weth.address,
                makingAmount: ether('15'),
                takingAmount: ether('0.015'),
                makerTraits: buildMakerTraits({ allowedSender: settlement.address }),
            },
            singleFusionData: { resolvers: [resolver.address] },
            orderSigner: addr1,
            dataFormFixture,
            additionalDataForSettlement: fillOrderToData2,
        });

        const fillOrderToData0 = await buildCalldataForOrder({
            orderData: {
                maker: addr1.address,
                makerAsset: dai.address,
                takerAsset: weth.address,
                makingAmount: ether('10'),
                takingAmount: ether('0.01'),
                makerTraits: buildMakerTraits({ allowedSender: settlement.address }),
            },
            singleFusionData: { resolvers: [resolver.address] },
            orderSigner: addr1,
            dataFormFixture,
            additionalDataForSettlement: fillOrderToData1,
        });

        const txn = await resolver.settleOrders(fillOrderToData0);
        await expect(txn).to.changeTokenBalances(weth, [addr, addr1], [ether('-0.025'), ether('0.025')]);
        await expect(txn).to.changeTokenBalances(dai, [addr, addr1], [ether('25'), ether('-25')]);
    });

    describe('dutch auction params', function () {
        const prepareSingleOrder = async ({
            startTime,
            auctionDelay = 0,
            initialRateBump = 1000000n,
            auctionDuration = 1800,
            targetTakingAmount = 0n,
            points = [],
            dataFormFixture,
        }) => {
            const {
                contracts: { dai, weth, settlement, resolver },
                accounts: { addr, addr1 },
                other: { abiCoder },
            } = dataFormFixture;

            let actualTakingAmount = targetTakingAmount;
            if (actualTakingAmount === 0n) {
                actualTakingAmount = ether('0.1');
                const ts = await time.latest();
                // TODO: avoid this shit (as well as any other computations in tests)
                if (ts < startTime + auctionDelay + auctionDuration) {
                    // actualTakingAmount = actualTakingAmount * (
                    //    _BASE_POINTS + initialRateBump * (startTime + auctionDelay + auctionDuration - currentTimestamp) / auctionDuration
                    // ) / _BASE_POINTS
                    const minDuration = startTime + auctionDelay + auctionDuration - ts > auctionDuration ? auctionDuration : startTime + auctionDelay + auctionDuration - ts - 2;
                    actualTakingAmount =
                        (actualTakingAmount * (10000000n + (BigInt(initialRateBump) * BigInt(minDuration)) / BigInt(auctionDuration))) /
                        10000000n;
                }
            }

            const resolverCalldata = abiCoder.encode(
                ['address[]', 'bytes[]'],
                [
                    [weth.address],
                    [
                        weth.interface.encodeFunctionData('transferFrom', [
                            addr.address,
                            resolver.address,
                            actualTakingAmount,
                        ]),
                    ],
                ],
            );

            const fillOrderToData = await buildCalldataForOrder({
                orderData: {
                    maker: addr1.address,
                    makerAsset: dai.address,
                    takerAsset: weth.address,
                    makingAmount: ether('100'),
                    takingAmount: ether('0.1'),
                    makerTraits: buildMakerTraits({ allowedSender: settlement.address }),
                },
                singleFusionData: { resolvers: [resolver.address], startTime, auctionDelay, auctionDuration, initialRateBump, points },
                orderSigner: addr1,
                dataFormFixture,
                additionalDataForSettlement: resolverCalldata,
                isInnermostOrder: true,
            });

            await weth.approve(resolver.address, actualTakingAmount);
            return fillOrderToData;
        };

        it('matching order before orderTime has maximal rate bump', async function () {
            const dataFormFixture = await loadFixture(initContracts);
            const {
                contracts: { dai, weth, resolver },
                accounts: { addr, addr1 },
            } = dataFormFixture;

            const fillOrderToData = await prepareSingleOrder({
                startTime: await time.latest(),
                auctionDelay: 60,
                dataFormFixture,
            });

            const txn = await resolver.settleOrders(fillOrderToData);
            await expect(txn).to.changeTokenBalances(dai, [resolver, addr1], [ether('100'), ether('-100')]);
            await expect(txn).to.changeTokenBalances(weth, [addr, addr1], [ether('-0.11'), ether('0.11')]);
        });

        describe('order with one bump point', async function () {
            it('matching order before bump point', async function () {
                const dataFormFixture = await loadFixture(initContracts);
                const {
                    contracts: { dai, weth, resolver },
                    accounts: { addr, addr1 },
                } = dataFormFixture;

                const startTime = await time.latest();
                const actualTakingAmount = ether('0.109');
                const fillOrderToData = await prepareSingleOrder({
                    startTime,
                    initialRateBump: 1000000n,
                    auctionDuration: 1800,
                    points: [[240, 900000n]],
                    targetTakingAmount: actualTakingAmount,
                    dataFormFixture,
                });

                await timeIncreaseTo(startTime + 239);

                const txn = await resolver.settleOrders(fillOrderToData);
                await expect(txn).to.changeTokenBalances(dai, [resolver, addr1], [ether('100'), ether('-100')]);
                await expect(txn).to.changeTokenBalances(weth, [addr, addr1], [ether('-0.109'), ether('0.109')]);
            });

            it('matching order after bump point', async function () {
                const dataFormFixture = await loadFixture(initContracts);
                const {
                    contracts: { dai, weth, resolver },
                    accounts: { addr, addr1 },
                } = dataFormFixture;

                const startTime = await time.latest();
                const actualTakingAmount = ether('0.106');
                const fillOrderToData = await prepareSingleOrder({
                    startTime,
                    initialRateBump: 1000000n,
                    auctionDuration: 1800,
                    points: [[240, 900000n]],
                    targetTakingAmount: actualTakingAmount,
                    dataFormFixture,
                });
                await timeIncreaseTo(startTime + 759);

                const txn = await resolver.settleOrders(fillOrderToData);
                await expect(txn).to.changeTokenBalances(dai, [resolver, addr1], [ether('100'), ether('-100')]);
                await expect(txn).to.changeTokenBalances(weth, [addr, addr1], [ether('-0.106'), ether('0.106')]);
            });
        });

        it('set initial rate', async function () {
            const dataFormFixture = await loadFixture(initContracts);
            const {
                contracts: { dai, weth, resolver },
                accounts: { addr, addr1 },
            } = dataFormFixture;

            const fillOrderToData = await prepareSingleOrder({
                startTime: await time.latest(),
                auctionDelay: 60,
                initialRateBump: 2000000n,
                dataFormFixture,
            });

            const txn = await resolver.settleOrders(fillOrderToData);
            await expect(txn).to.changeTokenBalances(dai, [resolver, addr1], [ether('100'), ether('-100')]);
            await expect(txn).to.changeTokenBalances(weth, [addr, addr1], [ether('-0.12'), ether('0.12')]);
        });

        it('set auctionDuration', async function () {
            const dataFormFixture = await loadFixture(initContracts);
            const {
                contracts: { dai, weth, resolver },
                accounts: { addr, addr1 },
            } = dataFormFixture;

            const normalizeTime = Math.floor(((await time.latest()) + 59) / 60) * 60;
            await time.increaseTo(normalizeTime);
            const fillOrderToData = await prepareSingleOrder({
                startTime: normalizeTime - 448,
                initialRateBump: 1000000n,
                auctionDuration: 900,
                dataFormFixture,
            });

            const txn = await resolver.settleOrders(fillOrderToData);
            await expect(txn).to.changeTokenBalances(dai, [resolver, addr1], [ether('100'), ether('-100')]);
            await expect(txn).to.changeTokenBalances(weth, [addr, addr1], [ether('-0.105'), ether('0.105')]);
        });
    });

    it('should change availableCredit with non-zero fee', async function () {
        const dataFormFixture = await loadFixture(initContracts);
        const {
            contracts: { dai, weth, settlement, resolver },
            accounts: { addr, addr1 },
            other: { orderFee, backOrderFee, basePoints },
        } = dataFormFixture;

        const fillOrderToData1 = await buildCalldataForOrder({
            orderData: {
                maker: addr1.address,
                makerAsset: weth.address,
                takerAsset: dai.address,
                makingAmount: ether('0.1'),
                takingAmount: ether('100'),
                makerTraits: buildMakerTraits({ allowedSender: settlement.address }),
            },
            singleFusionData: { resolvers: [resolver.address], resolverFee: backOrderFee },
            orderSigner: addr1,
            dataFormFixture,
            isInnermostOrder: true,
        });

        const fillOrderToData0 = await buildCalldataForOrder({
            orderData: {
                maker: addr.address,
                makerAsset: dai.address,
                takerAsset: weth.address,
                makingAmount: ether('100'),
                takingAmount: ether('0.1'),
                makerTraits: buildMakerTraits({ allowedSender: settlement.address }),
            },
            singleFusionData: { resolvers: [resolver.address], resolverFee: orderFee },
            orderSigner: addr,
            dataFormFixture,
            additionalDataForSettlement: fillOrderToData1,
        });
        const availableCreditBefore = await settlement.availableCredit(resolver.address);

        await resolver.settleOrders(fillOrderToData0);
        expect(await settlement.availableCredit(resolver.address)).to.equal(
            availableCreditBefore.toBigInt() - basePoints * (orderFee + backOrderFee),
        );
    });

    it('partial fill with taking fee', async function () {
        const dataFormFixture = await loadFixture(initContracts);
        const {
            contracts: { dai, weth, settlement, resolver },
            accounts: { addr, addr1 },
            other: { abiCoder, orderFee, basePoints },
        } = dataFormFixture;

        const partialModifier = 40n;
        const points = 100n;

        const resolverArgs = abiCoder.encode(
            ['address[]', 'bytes[]'],
            [
                [weth.address],
                [
                    weth.interface.encodeFunctionData('transferFrom', [
                        addr.address,
                        resolver.address,
                        ether('0.01') * partialModifier / points,
                    ]),
                ],
            ],
        );

        const fillOrderToData0 = await buildCalldataForOrder({
            orderData: {
                maker: addr1.address,
                makerAsset: dai.address,
                takerAsset: weth.address,
                makingAmount: ether('10'),
                takingAmount: ether('0.01'),
                makerTraits: buildMakerTraits({ allowedSender: settlement.address }),
            },
            singleFusionData: { resolvers: [resolver.address], resolverFee: orderFee },
            orderSigner: addr1,
            dataFormFixture,
            additionalDataForSettlement: resolverArgs,
            isInnermostOrder: true,
            fillingAmount: ether('10') * partialModifier / points,
        });

        await weth.approve(resolver.address, ether('0.01'));
        const availableCreditBefore = await settlement.availableCredit(resolver.address);

        const txn = await resolver.settleOrders(fillOrderToData0);
        await expect(txn).to.changeTokenBalances(dai, [resolver, addr1], [ether('10') * partialModifier / points, ether('-10') * partialModifier / points]);
        await expect(txn).to.changeTokenBalances(weth, [addr, addr1], [ether('-0.01') * partialModifier / points, ether('0.01') * partialModifier / points]);
        expect(await settlement.availableCredit(resolver.address)).to.equal(
            availableCreditBefore.toBigInt() - (orderFee * partialModifier / points) * basePoints,
        );
    });

    it('resolver should pay minimal 1 wei fee', async function () {
        const dataFormFixture = await loadFixture(initContracts);
        const {
            contracts: { dai, weth, settlement, resolver },
            accounts: { addr, addr1 },
            other: { abiCoder },
        } = dataFormFixture;

        const minimalPartialModifier = 1n;
        const points = ether('0.01');
        const minimalOrderFee = 1n;

        const resolverArgs = abiCoder.encode(
            ['address[]', 'bytes[]'],
            [
                [weth.address],
                [
                    weth.interface.encodeFunctionData('transferFrom', [
                        addr.address,
                        resolver.address,
                        ether('0.01') * minimalPartialModifier / points,
                    ]),
                ],
            ],
        );

        const fillOrderToData0 = await buildCalldataForOrder({
            orderData: {
                maker: addr1.address,
                makerAsset: dai.address,
                takerAsset: weth.address,
                makingAmount: ether('10'),
                takingAmount: ether('0.01'),
                makerTraits: buildMakerTraits({ allowedSender: settlement.address }),
            },
            singleFusionData: { resolvers: [resolver.address], resolverFee: minimalOrderFee },
            orderSigner: addr1,
            dataFormFixture,
            additionalDataForSettlement: resolverArgs,
            isInnermostOrder: true,
            fillingAmount: ether('10') * minimalPartialModifier / points,
        });

        await weth.approve(resolver.address, ether('0.01'));
        const availableCreditBefore = await settlement.availableCredit(resolver.address);

        const txn = await resolver.settleOrders(fillOrderToData0);
        await expect(txn).to.changeTokenBalances(dai, [resolver, addr1], [ether('10') * minimalPartialModifier / points, ether('-10') * minimalPartialModifier / points]);
        await expect(txn).to.changeTokenBalances(weth, [addr, addr1], [ether('-0.01') * minimalPartialModifier / points, ether('0.01') * minimalPartialModifier / points]);
        expect(await settlement.availableCredit(resolver.address)).to.equal(
            availableCreditBefore.toBigInt() - 1n,
        );
    });

    it('should not change when availableCredit is not enough', async function () {
        const dataFormFixture = await loadFixture(initContracts);
        const {
            contracts: { dai, weth, settlement, resolver },
            accounts: { addr, addr1 },
            other: { backOrderFee },
        } = dataFormFixture;

        const fillOrderToData1 = await buildCalldataForOrder({
            orderData: {
                maker: addr1.address,
                makerAsset: weth.address,
                takerAsset: dai.address,
                makingAmount: ether('0.1'),
                takingAmount: ether('100'),
                makerTraits: buildMakerTraits({ allowedSender: settlement.address }),
            },
            singleFusionData: { resolvers: [resolver.address], resolverFee: backOrderFee },
            orderSigner: addr1,
            dataFormFixture,
            isInnermostOrder: true,
        });

        const fillOrderToData0 = await buildCalldataForOrder({
            orderData: {
                maker: addr.address,
                makerAsset: dai.address,
                takerAsset: weth.address,
                makingAmount: ether('100'),
                takingAmount: ether('0.1'),
                makerTraits: buildMakerTraits({ allowedSender: settlement.address }),
            },
            singleFusionData: { resolvers: [resolver.address], resolverFee: '1000000' },
            orderSigner: addr,
            dataFormFixture,
            additionalDataForSettlement: fillOrderToData1,
        });

        await expect(resolver.settleOrders(fillOrderToData0)).to.be.revertedWithCustomError(settlement, 'NotEnoughCredit');
    });

    describe('whitelist lock period', async function () {
        it('should change only after whitelistedCutOff', async function () {
            const dataFormFixture = await loadFixture(initContracts);
            const {
                contracts: { dai, weth, settlement, resolver },
                accounts: { addr, addr1 },
                other: { orderFee },
            } = dataFormFixture;

            const currentTime = await time.latest();
            const threeHours = time.duration.hours('3');
            const fillOrderToData1 = await buildCalldataForOrder({
                orderData: {
                    maker: addr1.address,
                    makerAsset: weth.address,
                    takerAsset: dai.address,
                    makingAmount: ether('0.1'),
                    takingAmount: ether('100'),
                    makerTraits: buildMakerTraits({ allowedSender: settlement.address }),
                },
                singleFusionData: { resolvers: [addr1.address, resolver.address], auctionDuration: threeHours * 2, resolverFee: orderFee },
                orderSigner: addr1,
                dataFormFixture,
                isInnermostOrder: true,
            });

            const fillOrderToData0 = await buildCalldataForOrder({
                orderData: {
                    maker: addr.address,
                    makerAsset: dai.address,
                    takerAsset: weth.address,
                    makingAmount: ether('100'),
                    takingAmount: ether('0.1'),
                    makerTraits: buildMakerTraits({ allowedSender: settlement.address }),
                },
                singleFusionData: { resolvers: [addr1.address, resolver.address], auctionDuration: threeHours * 2, resolverFee: orderFee },
                orderSigner: addr,
                dataFormFixture,
                additionalDataForSettlement: fillOrderToData1,
            });

            await expect(resolver.settleOrders(fillOrderToData0)).to.be.revertedWithCustomError(settlement, 'ResolverIsNotWhitelisted');

            await timeIncreaseTo(currentTime + threeHours + 1);

            await resolver.settleOrders(fillOrderToData0);
        });

        it('should change by non-whitelisted resolver after publicCutOff', async function () {
            const dataFormFixture = await loadFixture(initContracts);
            const {
                contracts: { dai, weth, settlement, resolver },
                accounts: { addr, addr1 },
                other: { orderFee, backOrderFee },
            } = dataFormFixture;

            const fillOrderToData1 = await buildCalldataForOrder({
                orderData: {
                    maker: addr1.address,
                    makerAsset: weth.address,
                    takerAsset: dai.address,
                    makingAmount: ether('0.1'),
                    takingAmount: ether('100'),
                    makerTraits: buildMakerTraits({ allowedSender: settlement.address }),
                },
                singleFusionData: { publicTimeDelay: 60n, resolverFee: backOrderFee },
                orderSigner: addr1,
                dataFormFixture,
                isInnermostOrder: true,
            });

            const fillOrderToData0 = await buildCalldataForOrder({
                orderData: {
                    maker: addr.address,
                    makerAsset: dai.address,
                    takerAsset: weth.address,
                    makingAmount: ether('100'),
                    takingAmount: ether('0.1'),
                    makerTraits: buildMakerTraits({ allowedSender: settlement.address }),
                },
                singleFusionData: { publicTimeDelay: 60n, resolverFee: orderFee },
                orderSigner: addr,
                dataFormFixture,
                additionalDataForSettlement: fillOrderToData1,
            });

            await expect(resolver.settleOrders(fillOrderToData0)).to.be.revertedWithCustomError(settlement, 'ResolverIsNotWhitelisted');
            await timeIncreaseTo(BigInt(await time.latest()) + 100n);
            await resolver.settleOrders(fillOrderToData0);
        });
    });
});
