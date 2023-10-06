const { time, expect, ether, trim0x, timeIncreaseTo, getPermit, getPermit2, compressPermit, permit2Contract, deployContract } = require('@1inch/solidity-utils');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { ethers } = require('hardhat');
const { deploySwapTokens, getChainId } = require('./helpers/fixtures');
const { buildOrder, signOrder, compactSignature, fillWithMakingAmount, buildMakerTraits } = require('@1inch/limit-order-protocol-contract/test/helpers/orderUtils');
const { buildFusions } = require('./helpers/fusionUtils');

const ORDER_FEE = 100n;
const BACK_ORDER_FEE = 125n;
const BASE_POINTS = ether('0.001'); // 1e15

describe('Settlement', function () {
    async function initContracts() {
        const abiCoder = ethers.utils.defaultAbiCoder;
        const chainId = await getChainId();
        const [owner, alice, bob] = await ethers.getSigners();

        const { dai, weth, inch, swap } = await deploySwapTokens();

        await dai.transfer(alice.address, ether('100'));
        await inch.mint(owner.address, ether('100'));
        await weth.deposit({ value: ether('1') });
        await weth.connect(alice).deposit({ value: ether('1') });

        const settlement = await deployContract('SettlementMock', [swap.address, inch.address]);

        const FeeBank = await ethers.getContractFactory('FeeBank');
        const feeBank = FeeBank.attach(await settlement.feeBank());

        const ResolverMock = await ethers.getContractFactory('ResolverMock');
        const resolver = await ResolverMock.deploy(settlement.address, swap.address);

        await inch.approve(feeBank.address, ether('100'));
        await feeBank.depositFor(resolver.address, ether('100'));

        await dai.approve(swap.address, ether('100'));
        await dai.connect(alice).approve(swap.address, ether('100'));
        await weth.approve(swap.address, ether('1'));
        await weth.connect(alice).approve(swap.address, ether('1'));

        return {
            contracts: { dai, weth, swap, settlement, feeBank, resolver },
            accounts: { owner, alice, bob },
            others: { chainId, abiCoder },
        };
    }

    async function buildCalldataForOrder({
        orderData,
        singleFusionData,
        orderSigner,
        dataFormFixture,
        additionalDataForSettlement = '',
        isInnermostOrder = false,
        needAddResolvers = false,
        fillingAmount = orderData.makingAmount,
    }) {
        const {
            contracts: { swap, settlement, resolver },
            others: { chainId },
        } = dataFormFixture;
        const {
            fusions: [fusionDetails],
            hashes: [fusionHash],
            resolvers,
        } = await buildFusions([singleFusionData]);
        const order = buildOrder(orderData);
        order.salt = fusionHash;
        const { r, vs } = compactSignature(await signOrder(order, chainId, swap.address, orderSigner));
        const fillOrderToData = swap.interface.encodeFunctionData('fillOrderTo', [
            order,
            r,
            vs,
            fillingAmount,
            fillWithMakingAmount('0'),
            resolver.address,
            settlement.address + (isInnermostOrder ? '01' : '00') + trim0x(fusionDetails) + trim0x(additionalDataForSettlement),
        ]);
        return needAddResolvers ? fillOrderToData + trim0x(resolvers) : fillOrderToData;
    }

    it('opposite direction recursive swap', async function () {
        const dataFormFixture = await loadFixture(initContracts);
        const {
            contracts: { dai, weth, settlement, resolver },
            accounts: { owner, alice },
        } = dataFormFixture;

        const fillOrderToData1 = await buildCalldataForOrder({
            orderData: {
                maker: alice.address,
                makerAsset: weth.address,
                takerAsset: dai.address,
                makingAmount: ether('0.11'),
                takingAmount: ether('100'),
                makerTraits: buildMakerTraits({ allowedSender: settlement.address }),
            },
            singleFusionData: { resolvers: [resolver.address] },
            orderSigner: alice,
            dataFormFixture,
            isInnermostOrder: true,
        });

        const fillOrderToData0 = await buildCalldataForOrder({
            orderData: {
                maker: owner.address,
                makerAsset: dai.address,
                takerAsset: weth.address,
                makingAmount: ether('100'),
                takingAmount: ether('0.11'),
                makerTraits: buildMakerTraits({ allowedSender: settlement.address }),
            },
            singleFusionData: { resolvers: [resolver.address] },
            orderSigner: owner,
            dataFormFixture,
            additionalDataForSettlement: fillOrderToData1,
            needAddResolvers: true,
        });

        const txn = await resolver.settleOrders(fillOrderToData0);
        await expect(txn).to.changeTokenBalances(dai, [owner, alice], [ether('-100'), ether('100')]);
        await expect(txn).to.changeTokenBalances(weth, [owner, alice], [ether('0.11'), ether('-0.11')]);
    });

    it('settle orders with permits, permit', async function () {
        const dataFormFixture = await loadFixture(initContracts);
        const {
            contracts: { dai, weth, swap, settlement, resolver },
            accounts: { owner, alice },
            others: { chainId },
        } = dataFormFixture;

        const fillOrderToData1 = await buildCalldataForOrder({
            orderData: {
                maker: alice.address,
                makerAsset: weth.address,
                takerAsset: dai.address,
                makingAmount: ether('0.11'),
                takingAmount: ether('100'),
                makerTraits: buildMakerTraits({ allowedSender: settlement.address }),
            },
            singleFusionData: { resolvers: [resolver.address] },
            orderSigner: alice,
            dataFormFixture,
            isInnermostOrder: true,
        });

        const fillOrderToData0 = await buildCalldataForOrder({
            orderData: {
                maker: owner.address,
                makerAsset: dai.address,
                takerAsset: weth.address,
                makingAmount: ether('100'),
                takingAmount: ether('0.11'),
                makerTraits: buildMakerTraits({ allowedSender: settlement.address }),
            },
            singleFusionData: { resolvers: [resolver.address] },
            orderSigner: owner,
            dataFormFixture,
            additionalDataForSettlement: fillOrderToData1,
            needAddResolvers: true,
        });

        await weth.connect(alice).approve(swap.address, ether('0.11'));
        await dai.connect(owner).approve(swap.address, 0n); // remove direct approve
        const permit0 = compressPermit(await getPermit(owner, dai, '1', chainId, swap.address, ether('100')));
        const packing = (1n << 248n) | 1n;
        const txn = await resolver.settleOrdersWithPermits(fillOrderToData0, packing,
            owner.address + trim0x(dai.address) + trim0x(permit0));
        await expect(txn).to.changeTokenBalances(dai, [owner, alice], [ether('-100'), ether('100')]);
        await expect(txn).to.changeTokenBalances(weth, [owner, alice], [ether('0.11'), ether('-0.11')]);
    });

    it('settle orders with permits, permit2', async function () {
        const dataFormFixture = await loadFixture(initContracts);
        const {
            contracts: { dai, weth, swap, settlement, resolver },
            accounts: { owner, alice },
            others: { chainId },
        } = dataFormFixture;

        const fillOrderToData1 = await buildCalldataForOrder({
            orderData: {
                maker: alice.address,
                makerAsset: weth.address,
                takerAsset: dai.address,
                makingAmount: ether('0.11'),
                takingAmount: ether('100'),
                makerTraits: buildMakerTraits({ allowedSender: settlement.address, usePermit2: true }),
            },
            singleFusionData: { resolvers: [resolver.address] },
            orderSigner: alice,
            dataFormFixture,
            isInnermostOrder: true,
        });

        const fillOrderToData0 = await buildCalldataForOrder({
            orderData: {
                maker: owner.address,
                makerAsset: dai.address,
                takerAsset: weth.address,
                makingAmount: ether('100'),
                takingAmount: ether('0.11'),
                makerTraits: buildMakerTraits({ allowedSender: settlement.address, usePermit2: true }),
            },
            singleFusionData: { resolvers: [resolver.address] },
            orderSigner: owner,
            dataFormFixture,
            additionalDataForSettlement: fillOrderToData1,
            needAddResolvers: true,
        });

        const permit2 = await permit2Contract();
        await dai.approve(permit2.address, ether('100'));
        await weth.connect(alice).approve(permit2.address, ether('0.11'));
        await dai.connect(owner).approve(swap.address, 0n); // remove direct approve
        await weth.connect(alice).approve(swap.address, 0n); // remove direct approve
        const permit0 = compressPermit(await getPermit2(owner, dai.address, chainId, swap.address, ether('100')));
        const permit1 = compressPermit(await getPermit2(alice, weth.address, chainId, swap.address, ether('0.11')));
        const packing = (2n << 248n) | 2n | 8n;
        const txn = await resolver.settleOrdersWithPermits(fillOrderToData0, packing,
            owner.address + trim0x(dai.address) + trim0x(permit0) + trim0x(alice.address) + trim0x(weth.address) + trim0x(permit1));
        await expect(txn).to.changeTokenBalances(dai, [owner, alice], [ether('-100'), ether('100')]);
        await expect(txn).to.changeTokenBalances(weth, [owner, alice], [ether('0.11'), ether('-0.11')]);
    });

    it('opposite direction recursive swap with taking fee', async function () {
        const dataFormFixture = await loadFixture(initContracts);
        const {
            contracts: { dai, weth, settlement, resolver },
            accounts: { owner, alice, bob },
        } = dataFormFixture;

        const fillOrderToData1 = await buildCalldataForOrder({
            orderData: {
                maker: alice.address,
                makerAsset: weth.address,
                takerAsset: dai.address,
                makingAmount: ether('0.1'),
                takingAmount: ether('100'),
                makerTraits: buildMakerTraits({ allowedSender: settlement.address }),
            },
            singleFusionData: { resolvers: [resolver.address], takerFee: 10000000n, takerFeeReceiver: bob.address },
            orderSigner: alice,
            dataFormFixture,
            isInnermostOrder: true,
        });

        const fillOrderToData0 = await buildCalldataForOrder({
            orderData: {
                maker: owner.address,
                makerAsset: dai.address,
                takerAsset: weth.address,
                makingAmount: ether('100'),
                takingAmount: ether('0.1'),
                makerTraits: buildMakerTraits({ allowedSender: settlement.address }),
            },
            singleFusionData: { resolvers: [resolver.address], takerFee: 10000000n, takerFeeReceiver: bob.address },
            orderSigner: owner,
            dataFormFixture,
            additionalDataForSettlement: fillOrderToData1,
            needAddResolvers: true,
        });

        const wethFeeAmount = ether('0.001');
        const daiFeeAmount = ether('1');
        // send fee amounts to resolver contract
        await weth.transfer(resolver.address, wethFeeAmount.toString());
        await dai.connect(alice).transfer(resolver.address, daiFeeAmount.toString());

        const txn = await resolver.settleOrders(fillOrderToData0);
        await expect(txn).to.changeTokenBalances(dai, [owner, alice, bob], [ether('-100'), ether('100'), ether('1')]);
        await expect(txn).to.changeTokenBalances(weth, [owner, alice, bob], [ether('0.1'), ether('-0.1'), ether('0.001')]);
    });

    it('unidirectional recursive swap', async function () {
        const dataFormFixture = await loadFixture(initContracts);
        const {
            contracts: { dai, weth, settlement, resolver },
            accounts: { owner, alice },
            others: { abiCoder },
        } = dataFormFixture;

        const resolverArgs = abiCoder.encode(
            ['address[]', 'bytes[]'],
            [
                [weth.address],
                [
                    weth.interface.encodeFunctionData('transferFrom', [
                        owner.address,
                        resolver.address,
                        ether('0.025'),
                    ]),
                ],
            ],
        );

        const fillOrderToData1 = await buildCalldataForOrder({
            orderData: {
                maker: alice.address,
                makerAsset: dai.address,
                takerAsset: weth.address,
                makingAmount: ether('15'),
                takingAmount: ether('0.015'),
                makerTraits: buildMakerTraits({ allowedSender: settlement.address }),
            },
            singleFusionData: { resolvers: [resolver.address] },
            orderSigner: alice,
            dataFormFixture,
            additionalDataForSettlement: resolverArgs,
            isInnermostOrder: true,
        });

        const fillOrderToData0 = await buildCalldataForOrder({
            orderData: {
                maker: alice.address,
                makerAsset: dai.address,
                takerAsset: weth.address,
                makingAmount: ether('10'),
                takingAmount: ether('0.01'),
                makerTraits: buildMakerTraits({ allowedSender: settlement.address }),
            },
            singleFusionData: { resolvers: [resolver.address] },
            orderSigner: alice,
            dataFormFixture,
            additionalDataForSettlement: fillOrderToData1,
            needAddResolvers: true,
        });

        await weth.approve(resolver.address, ether('0.025'));

        const txn = await resolver.settleOrders(fillOrderToData0);
        await expect(txn).to.changeTokenBalances(dai, [resolver, alice], [ether('25'), ether('-25')]);
        await expect(txn).to.changeTokenBalances(weth, [owner, alice], [ether('-0.025'), ether('0.025')]);
    });

    it('triple recursive swap', async function () {
        const dataFormFixture = await loadFixture(initContracts);
        const {
            contracts: { dai, weth, settlement, resolver },
            accounts: { owner, alice },
        } = dataFormFixture;

        const fillOrderToData2 = await buildCalldataForOrder({
            orderData: {
                maker: owner.address,
                makerAsset: weth.address,
                takerAsset: dai.address,
                makingAmount: ether('0.025'),
                takingAmount: ether('25'),
                allowedSender: settlement.address,
            },
            singleFusionData: { resolvers: [resolver.address] },
            orderSigner: owner,
            dataFormFixture,
            isInnermostOrder: true,
        });

        const fillOrderToData1 = await buildCalldataForOrder({
            orderData: {
                maker: alice.address,
                makerAsset: dai.address,
                takerAsset: weth.address,
                makingAmount: ether('15'),
                takingAmount: ether('0.015'),
                makerTraits: buildMakerTraits({ allowedSender: settlement.address }),
            },
            singleFusionData: { resolvers: [resolver.address] },
            orderSigner: alice,
            dataFormFixture,
            additionalDataForSettlement: fillOrderToData2,
        });

        const fillOrderToData0 = await buildCalldataForOrder({
            orderData: {
                maker: alice.address,
                makerAsset: dai.address,
                takerAsset: weth.address,
                makingAmount: ether('10'),
                takingAmount: ether('0.01'),
                makerTraits: buildMakerTraits({ allowedSender: settlement.address }),
            },
            singleFusionData: { resolvers: [resolver.address] },
            orderSigner: alice,
            dataFormFixture,
            additionalDataForSettlement: fillOrderToData1,
            needAddResolvers: true,
        });

        const txn = await resolver.settleOrders(fillOrderToData0);
        await expect(txn).to.changeTokenBalances(weth, [owner, alice], [ether('-0.025'), ether('0.025')]);
        await expect(txn).to.changeTokenBalances(dai, [owner, alice], [ether('25'), ether('-25')]);
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
                accounts: { owner, alice },
                others: { abiCoder },
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
                            owner.address,
                            resolver.address,
                            actualTakingAmount,
                        ]),
                    ],
                ],
            );

            const fillOrderToData = await buildCalldataForOrder({
                orderData: {
                    maker: alice.address,
                    makerAsset: dai.address,
                    takerAsset: weth.address,
                    makingAmount: ether('100'),
                    takingAmount: ether('0.1'),
                    makerTraits: buildMakerTraits({ allowedSender: settlement.address }),
                },
                singleFusionData: { resolvers: [resolver.address], startTime, auctionDelay, auctionDuration, initialRateBump, points },
                orderSigner: alice,
                dataFormFixture,
                additionalDataForSettlement: resolverCalldata,
                isInnermostOrder: true,
                needAddResolvers: true,
            });

            await weth.approve(resolver.address, actualTakingAmount);
            return fillOrderToData;
        };

        it('matching order before orderTime has maximal rate bump', async function () {
            const dataFormFixture = await loadFixture(initContracts);
            const {
                contracts: { dai, weth, resolver },
                accounts: { owner, alice },
            } = dataFormFixture;

            const fillOrderToData = await prepareSingleOrder({
                startTime: await time.latest(),
                auctionDelay: 60,
                dataFormFixture,
            });

            const txn = await resolver.settleOrders(fillOrderToData);
            await expect(txn).to.changeTokenBalances(dai, [resolver, alice], [ether('100'), ether('-100')]);
            await expect(txn).to.changeTokenBalances(weth, [owner, alice], [ether('-0.11'), ether('0.11')]);
        });

        describe('order with one bump point', async function () {
            it('matching order before bump point', async function () {
                const dataFormFixture = await loadFixture(initContracts);
                const {
                    contracts: { dai, weth, resolver },
                    accounts: { owner, alice },
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
                await expect(txn).to.changeTokenBalances(dai, [resolver, alice], [ether('100'), ether('-100')]);
                await expect(txn).to.changeTokenBalances(weth, [owner, alice], [ether('-0.109'), ether('0.109')]);
            });

            it('matching order after bump point', async function () {
                const dataFormFixture = await loadFixture(initContracts);
                const {
                    contracts: { dai, weth, resolver },
                    accounts: { owner, alice },
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
                await expect(txn).to.changeTokenBalances(dai, [resolver, alice], [ether('100'), ether('-100')]);
                await expect(txn).to.changeTokenBalances(weth, [owner, alice], [ether('-0.106'), ether('0.106')]);
            });
        });

        it('set initial rate', async function () {
            const dataFormFixture = await loadFixture(initContracts);
            const {
                contracts: { dai, weth, resolver },
                accounts: { owner, alice },
            } = dataFormFixture;

            const fillOrderToData = await prepareSingleOrder({
                startTime: await time.latest(),
                auctionDelay: 60,
                initialRateBump: 2000000n,
                dataFormFixture,
            });

            const txn = await resolver.settleOrders(fillOrderToData);
            await expect(txn).to.changeTokenBalances(dai, [resolver, alice], [ether('100'), ether('-100')]);
            await expect(txn).to.changeTokenBalances(weth, [owner, alice], [ether('-0.12'), ether('0.12')]);
        });

        it('set auctionDuration', async function () {
            const dataFormFixture = await loadFixture(initContracts);
            const {
                contracts: { dai, weth, resolver },
                accounts: { owner, alice },
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
            await expect(txn).to.changeTokenBalances(dai, [resolver, alice], [ether('100'), ether('-100')]);
            await expect(txn).to.changeTokenBalances(weth, [owner, alice], [ether('-0.105'), ether('0.105')]);
        });
    });

    it('should change availableCredit with non-zero fee', async function () {
        const dataFormFixture = await loadFixture(initContracts);
        const {
            contracts: { dai, weth, settlement, resolver },
            accounts: { owner, alice },
        } = dataFormFixture;

        const fillOrderToData1 = await buildCalldataForOrder({
            orderData: {
                maker: alice.address,
                makerAsset: weth.address,
                takerAsset: dai.address,
                makingAmount: ether('0.1'),
                takingAmount: ether('100'),
                makerTraits: buildMakerTraits({ allowedSender: settlement.address }),
            },
            singleFusionData: { resolvers: [resolver.address], resolverFee: BACK_ORDER_FEE },
            orderSigner: alice,
            dataFormFixture,
            isInnermostOrder: true,
        });

        const fillOrderToData0 = await buildCalldataForOrder({
            orderData: {
                maker: owner.address,
                makerAsset: dai.address,
                takerAsset: weth.address,
                makingAmount: ether('100'),
                takingAmount: ether('0.1'),
                makerTraits: buildMakerTraits({ allowedSender: settlement.address }),
            },
            singleFusionData: { resolvers: [resolver.address], resolverFee: ORDER_FEE },
            orderSigner: owner,
            dataFormFixture,
            additionalDataForSettlement: fillOrderToData1,
            needAddResolvers: true,
        });
        const availableCreditBefore = await settlement.availableCredit(resolver.address);

        await resolver.settleOrders(fillOrderToData0);
        expect(await settlement.availableCredit(resolver.address)).to.equal(
            availableCreditBefore.toBigInt() - BASE_POINTS * (ORDER_FEE + BACK_ORDER_FEE),
        );
    });

    it('partial fill with taking fee', async function () {
        const dataFormFixture = await loadFixture(initContracts);
        const {
            contracts: { dai, weth, settlement, resolver },
            accounts: { owner, alice },
            others: { abiCoder },
        } = dataFormFixture;

        const partialModifier = 40n;
        const points = 100n;

        const resolverArgs = abiCoder.encode(
            ['address[]', 'bytes[]'],
            [
                [weth.address],
                [
                    weth.interface.encodeFunctionData('transferFrom', [
                        owner.address,
                        resolver.address,
                        ether('0.01') * partialModifier / points,
                    ]),
                ],
            ],
        );

        const fillOrderToData0 = await buildCalldataForOrder({
            orderData: {
                maker: alice.address,
                makerAsset: dai.address,
                takerAsset: weth.address,
                makingAmount: ether('10'),
                takingAmount: ether('0.01'),
                makerTraits: buildMakerTraits({ allowedSender: settlement.address }),
            },
            singleFusionData: { resolvers: [resolver.address], resolverFee: ORDER_FEE },
            orderSigner: alice,
            dataFormFixture,
            additionalDataForSettlement: resolverArgs,
            isInnermostOrder: true,
            needAddResolvers: true,
            fillingAmount: ether('10') * partialModifier / points,
        });

        await weth.approve(resolver.address, ether('0.01'));
        const availableCreditBefore = await settlement.availableCredit(resolver.address);

        const txn = await resolver.settleOrders(fillOrderToData0);
        await expect(txn).to.changeTokenBalances(dai, [resolver, alice], [ether('10') * partialModifier / points, ether('-10') * partialModifier / points]);
        await expect(txn).to.changeTokenBalances(weth, [owner, alice], [ether('-0.01') * partialModifier / points, ether('0.01') * partialModifier / points]);
        expect(await settlement.availableCredit(resolver.address)).to.equal(
            availableCreditBefore.toBigInt() - (ORDER_FEE * partialModifier / points) * BASE_POINTS,
        );
    });

    it('resolver should pay minimal 1 wei fee', async function () {
        const dataFormFixture = await loadFixture(initContracts);
        const {
            contracts: { dai, weth, settlement, resolver },
            accounts: { owner, alice },
            others: { abiCoder },
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
                        owner.address,
                        resolver.address,
                        ether('0.01') * minimalPartialModifier / points,
                    ]),
                ],
            ],
        );

        const fillOrderToData0 = await buildCalldataForOrder({
            orderData: {
                maker: alice.address,
                makerAsset: dai.address,
                takerAsset: weth.address,
                makingAmount: ether('10'),
                takingAmount: ether('0.01'),
                makerTraits: buildMakerTraits({ allowedSender: settlement.address }),
            },
            singleFusionData: { resolvers: [resolver.address], resolverFee: minimalOrderFee },
            orderSigner: alice,
            dataFormFixture,
            additionalDataForSettlement: resolverArgs,
            isInnermostOrder: true,
            needAddResolvers: true,
            fillingAmount: ether('10') * minimalPartialModifier / points,
        });

        await weth.approve(resolver.address, ether('0.01'));
        const availableCreditBefore = await settlement.availableCredit(resolver.address);

        const txn = await resolver.settleOrders(fillOrderToData0);
        await expect(txn).to.changeTokenBalances(dai, [resolver, alice], [ether('10') * minimalPartialModifier / points, ether('-10') * minimalPartialModifier / points]);
        await expect(txn).to.changeTokenBalances(weth, [owner, alice], [ether('-0.01') * minimalPartialModifier / points, ether('0.01') * minimalPartialModifier / points]);
        expect(await settlement.availableCredit(resolver.address)).to.equal(
            availableCreditBefore.toBigInt() - 1n,
        );
    });

    it('should not change when availableCredit is not enough', async function () {
        const dataFormFixture = await loadFixture(initContracts);
        const {
            contracts: { dai, weth, settlement, resolver },
            accounts: { owner, alice },
            others: { BACK_ORDER_FEE },
        } = dataFormFixture;

        const fillOrderToData1 = await buildCalldataForOrder({
            orderData: {
                maker: alice.address,
                makerAsset: weth.address,
                takerAsset: dai.address,
                makingAmount: ether('0.1'),
                takingAmount: ether('100'),
                makerTraits: buildMakerTraits({ allowedSender: settlement.address }),
            },
            singleFusionData: { resolvers: [resolver.address], resolverFee: BACK_ORDER_FEE },
            orderSigner: alice,
            dataFormFixture,
            isInnermostOrder: true,
        });

        const fillOrderToData0 = await buildCalldataForOrder({
            orderData: {
                maker: owner.address,
                makerAsset: dai.address,
                takerAsset: weth.address,
                makingAmount: ether('100'),
                takingAmount: ether('0.1'),
                makerTraits: buildMakerTraits({ allowedSender: settlement.address }),
            },
            singleFusionData: { resolvers: [resolver.address], resolverFee: '1000000' },
            orderSigner: owner,
            dataFormFixture,
            additionalDataForSettlement: fillOrderToData1,
            needAddResolvers: true,
        });

        await expect(resolver.settleOrders(fillOrderToData0)).to.be.revertedWithCustomError(settlement, 'NotEnoughCredit');
    });

    describe('whitelist lock period', async function () {
        it('should change only after whitelistedCutOff', async function () {
            const dataFormFixture = await loadFixture(initContracts);
            const {
                contracts: { dai, weth, settlement, resolver },
                accounts: { owner, alice },
            } = dataFormFixture;

            const currentTime = await time.latest();
            const threeHours = time.duration.hours('3');
            const fillOrderToData1 = await buildCalldataForOrder({
                orderData: {
                    maker: alice.address,
                    makerAsset: weth.address,
                    takerAsset: dai.address,
                    makingAmount: ether('0.1'),
                    takingAmount: ether('100'),
                    makerTraits: buildMakerTraits({ allowedSender: settlement.address }),
                },
                singleFusionData: { resolvers: [alice.address, resolver.address], auctionDuration: threeHours * 2, resolverFee: ORDER_FEE },
                orderSigner: alice,
                dataFormFixture,
                isInnermostOrder: true,
            });

            const fillOrderToData0 = await buildCalldataForOrder({
                orderData: {
                    maker: owner.address,
                    makerAsset: dai.address,
                    takerAsset: weth.address,
                    makingAmount: ether('100'),
                    takingAmount: ether('0.1'),
                    makerTraits: buildMakerTraits({ allowedSender: settlement.address }),
                },
                singleFusionData: { resolvers: [alice.address, resolver.address], auctionDuration: threeHours * 2, resolverFee: ORDER_FEE },
                orderSigner: owner,
                dataFormFixture,
                additionalDataForSettlement: fillOrderToData1,
                needAddResolvers: true,
            });

            await expect(resolver.settleOrders(fillOrderToData0)).to.be.revertedWithCustomError(settlement, 'ResolverIsNotWhitelisted');

            await timeIncreaseTo(currentTime + threeHours + 1);

            await resolver.settleOrders(fillOrderToData0);
        });

        it('should change by non-whitelisted resolver after publicCutOff', async function () {
            const dataFormFixture = await loadFixture(initContracts);
            const {
                contracts: { dai, weth, settlement, resolver },
                accounts: { owner, alice },
            } = dataFormFixture;

            const fillOrderToData1 = await buildCalldataForOrder({
                orderData: {
                    maker: alice.address,
                    makerAsset: weth.address,
                    takerAsset: dai.address,
                    makingAmount: ether('0.1'),
                    takingAmount: ether('100'),
                    makerTraits: buildMakerTraits({ allowedSender: settlement.address }),
                },
                singleFusionData: { publicTimeDelay: 60n, resolverFee: BACK_ORDER_FEE },
                orderSigner: alice,
                dataFormFixture,
                isInnermostOrder: true,
            });

            const fillOrderToData0 = await buildCalldataForOrder({
                orderData: {
                    maker: owner.address,
                    makerAsset: dai.address,
                    takerAsset: weth.address,
                    makingAmount: ether('100'),
                    takingAmount: ether('0.1'),
                    makerTraits: buildMakerTraits({ allowedSender: settlement.address }),
                },
                singleFusionData: { publicTimeDelay: 60n, resolverFee: ORDER_FEE },
                orderSigner: owner,
                dataFormFixture,
                additionalDataForSettlement: fillOrderToData1,
                needAddResolvers: true,
            });

            await expect(resolver.settleOrders(fillOrderToData0)).to.be.revertedWithCustomError(settlement, 'ResolverIsNotWhitelisted');
            await timeIncreaseTo(BigInt(await time.latest()) + 100n);
            await resolver.settleOrders(fillOrderToData0);
        });
    });
});
