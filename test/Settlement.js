const { time, expect, ether, trim0x, timeIncreaseTo } = require('@1inch/solidity-utils');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { ethers } = require('hardhat');
const { keccak256 } = require('ethers/lib/utils');
const { deploySwapTokens, getChainId } = require('./helpers/fixtures');
const { buildOrder, signOrder, compactSignature, fillWithMakingAmount, buildMakerTraits } = require('@1inch/limit-order-protocol-contract/test/helpers/orderUtils');
const { buildFusion } = require('./helpers/fusionUtils');

describe('Settlement', function () {
    const basePoints = ether('0.001'); // 1e15
    const orderFee = 100n;
    const backOrderFee = 125n;
    let addr, addr1, addr2;
    let chainId;
    const abiCoder = ethers.utils.defaultAbiCoder;

    before(async function () {
        chainId = await getChainId();
        [addr, addr1, addr2] = await ethers.getSigners();
    });

    async function initContracts() {
        const { dai, weth, inch, swap } = await deploySwapTokens();

        await dai.mint(addr.address, ether('100'));
        await dai.mint(addr1.address, ether('100'));
        await inch.mint(addr.address, ether('100'));
        await weth.deposit({ value: ether('1') });
        await weth.connect(addr1).deposit({ value: ether('1') });

        await dai.approve(swap.address, ether('100'));
        await dai.connect(addr1).approve(swap.address, ether('100'));
        await weth.approve(swap.address, ether('1'));
        await weth.connect(addr1).approve(swap.address, ether('1'));

        const SettlementMock = await ethers.getContractFactory('SettlementMock');
        const settlement = await SettlementMock.deploy(swap.address, inch.address);
        await settlement.deployed();

        const FeeBank = await ethers.getContractFactory('FeeBank');
        const feeBank = await FeeBank.attach(await settlement.feeBank());

        const ResolverMock = await ethers.getContractFactory('ResolverMock');
        const resolver = await ResolverMock.deploy(settlement.address);

        await inch.approve(feeBank.address, ether('100'));
        await feeBank.depositFor(resolver.address, ether('100'));

        return { dai, weth, swap, settlement, feeBank, resolver };
    }

    it('opposite direction recursive swap', async function () {
        const { dai, weth, swap, settlement, resolver } = await loadFixture(initContracts);

        const fusionDetails = await buildFusion({ resolvers: [resolver.address] });

        const order0 = await buildOrder({
            maker: addr.address,
            makerAsset: dai.address,
            takerAsset: weth.address,
            makingAmount: ether('100'),
            takingAmount: ether('0.11'),
            makerTraits: buildMakerTraits({ allowedSender: settlement.address }),
        });
        order0.salt = keccak256(fusionDetails);

        const order1 = await buildOrder({
            maker: addr1.address,
            makerAsset: weth.address,
            takerAsset: dai.address,
            makingAmount: ether('0.11'),
            takingAmount: ether('100'),
            makerTraits: buildMakerTraits({ allowedSender: settlement.address }),
        });
        order1.salt = keccak256(fusionDetails);

        const { r: r0, vs: vs0 } = compactSignature(await signOrder(order0, chainId, swap.address, addr));
        const { r: r1, vs: vs1 } = compactSignature(await signOrder(order1, chainId, swap.address, addr1));

        const fillOrderToData1 = swap.interface.encodeFunctionData('fillOrderTo', [
            order1,
            r1,
            vs1,
            ether('0.11'),
            fillWithMakingAmount('0'),
            resolver.address,
            settlement.address + '01' + trim0x(fusionDetails),
        ]);

        const fillOrderToData0 = swap.interface.encodeFunctionData('fillOrderTo', [
            order0,
            r0,
            vs0,
            ether('100'),
            fillWithMakingAmount('0'),
            resolver.address,
            settlement.address + '00' + trim0x(fusionDetails) + trim0x(fillOrderToData1),
        ]);

        const txn = await resolver.settleOrders(fillOrderToData0);
        await expect(txn).to.changeTokenBalances(dai, [addr, addr1], [ether('-100'), ether('100')]);
        await expect(txn).to.changeTokenBalances(weth, [addr, addr1], [ether('0.11'), ether('-0.11')]);
    });

    it('opposite direction recursive swap with taking fee', async function () {
        const { dai, weth, swap, settlement, resolver } = await loadFixture(initContracts);

        const fusionDetails = await buildFusion({ resolvers: [resolver.address], takerFee: 10000000n, takerFeeReceiver: addr2.address });

        const order0 = await buildOrder({
            maker: addr.address,
            makerAsset: dai.address,
            takerAsset: weth.address,
            makingAmount: ether('100'),
            takingAmount: ether('0.1'),
            makerTraits: buildMakerTraits({ allowedSender: settlement.address }),
        });
        order0.salt = keccak256(fusionDetails);

        const order1 = await buildOrder({
            maker: addr1.address,
            makerAsset: weth.address,
            takerAsset: dai.address,
            makingAmount: ether('0.1'),
            takingAmount: ether('100'),
            makerTraits: buildMakerTraits({ allowedSender: settlement.address }),
        });
        order1.salt = keccak256(fusionDetails);

        const { r: r0, vs: vs0 } = compactSignature(await signOrder(order0, chainId, swap.address, addr));
        const { r: r1, vs: vs1 } = compactSignature(await signOrder(order1, chainId, swap.address, addr1));

        const wethFeeAmount = ether('0.001');
        const daiFeeAmount = ether('1');
        // send fee amounts to resolver contract
        await weth.transfer(resolver.address, wethFeeAmount.toString());
        await dai.connect(addr1).transfer(resolver.address, daiFeeAmount.toString());

        const fillOrderToData1 = swap.interface.encodeFunctionData('fillOrderTo', [
            order1,
            r1,
            vs1,
            ether('0.1'),
            fillWithMakingAmount('0'),
            resolver.address,
            settlement.address + '01' + trim0x(fusionDetails),
        ]);

        const fillOrderToData0 = swap.interface.encodeFunctionData('fillOrderTo', [
            order0,
            r0,
            vs0,
            ether('100'),
            fillWithMakingAmount('0'),
            resolver.address,
            settlement.address + '00' + trim0x(fusionDetails) + trim0x(fillOrderToData1),
        ]);

        const txn = await resolver.settleOrders(fillOrderToData0);
        await expect(txn).to.changeTokenBalances(dai, [addr, addr1, addr2], [ether('-100'), ether('100'), ether('1')]);
        await expect(txn).to.changeTokenBalances(weth, [addr, addr1, addr2], [ether('0.1'), ether('-0.1'), ether('0.001')]);
    });

    it('unidirectional recursive swap', async function () {
        const { dai, weth, swap, settlement, resolver } = await loadFixture(initContracts);

        const fusionDetails = await buildFusion({ resolvers: [resolver.address] });

        const order0 = await buildOrder({
            maker: addr1.address,
            makerAsset: dai.address,
            takerAsset: weth.address,
            makingAmount: ether('10'),
            takingAmount: ether('0.01'),
            makerTraits: buildMakerTraits({ allowedSender: settlement.address }),
        });
        order0.salt = keccak256(fusionDetails);

        const order1 = await buildOrder({
            maker: addr1.address,
            makerAsset: dai.address,
            takerAsset: weth.address,
            makingAmount: ether('15'),
            takingAmount: ether('0.015'),
            makerTraits: buildMakerTraits({ allowedSender: settlement.address }),
        });
        order1.salt = keccak256(fusionDetails);

        const { r: r0, vs: vs0 } = compactSignature(await signOrder(order0, chainId, swap.address, addr1));
        const { r: r1, vs: vs1 } = compactSignature(await signOrder(order1, chainId, swap.address, addr1));

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

        const fillOrderToData1 = swap.interface.encodeFunctionData('fillOrderTo', [
            order1,
            r1,
            vs1,
            ether('15'),
            fillWithMakingAmount('0'),
            resolver.address,
            settlement.address + '01' + trim0x(fusionDetails) + trim0x(resolverArgs),
        ]);

        const fillOrderToData0 = swap.interface.encodeFunctionData('fillOrderTo', [
            order0,
            r0,
            vs0,
            ether('10'),
            fillWithMakingAmount('0'),
            resolver.address,
            settlement.address + '00' + trim0x(fusionDetails) + trim0x(fillOrderToData1),
        ]);

        await weth.approve(resolver.address, ether('0.025'));

        const txn = await resolver.settleOrders(fillOrderToData0);
        await expect(txn).to.changeTokenBalances(dai, [resolver, addr1], [ether('25'), ether('-25')]);
        await expect(txn).to.changeTokenBalances(weth, [addr, addr1], [ether('-0.025'), ether('0.025')]);
    });

    it('triple recursive swap', async function () {
        const { dai, weth, swap, settlement, resolver } = await loadFixture(initContracts);

        const fusionDetails = await buildFusion({ resolvers: [resolver.address] });

        const order0 = await buildOrder({
            maker: addr1.address,
            makerAsset: dai.address,
            takerAsset: weth.address,
            makingAmount: ether('10'),
            takingAmount: ether('0.01'),
            makerTraits: buildMakerTraits({ allowedSender: settlement.address }),
        });
        order0.salt = keccak256(fusionDetails);

        const order1 = await buildOrder({
            maker: addr1.address,
            makerAsset: dai.address,
            takerAsset: weth.address,
            makingAmount: ether('15'),
            takingAmount: ether('0.015'),
            makerTraits: buildMakerTraits({ allowedSender: settlement.address }),
        });
        order1.salt = keccak256(fusionDetails);

        const order2 = await buildOrder({
            maker: addr.address,
            makerAsset: weth.address,
            takerAsset: dai.address,
            makingAmount: ether('0.025'),
            takingAmount: ether('25'),
            allowedSender: settlement.address,
        });
        order2.salt = keccak256(fusionDetails);

        const { r: r0, vs: vs0 } = compactSignature(await signOrder(order0, chainId, swap.address, addr1));
        const { r: r1, vs: vs1 } = compactSignature(await signOrder(order1, chainId, swap.address, addr1));
        const { r: r2, vs: vs2 } = compactSignature(await signOrder(order2, chainId, swap.address, addr));

        const fillOrderToData2 = swap.interface.encodeFunctionData('fillOrderTo', [
            order2,
            r2,
            vs2,
            ether('0.025'),
            fillWithMakingAmount('0'),
            resolver.address,
            settlement.address + '01' + trim0x(fusionDetails),
        ]);

        const fillOrderToData1 = swap.interface.encodeFunctionData('fillOrderTo', [
            order1,
            r1,
            vs1,
            ether('15'),
            fillWithMakingAmount('0'),
            resolver.address,
            settlement.address + '00' + trim0x(fusionDetails) + trim0x(fillOrderToData2),
        ]);

        const fillOrderToData0 = swap.interface.encodeFunctionData('fillOrderTo', [
            order0,
            r0,
            vs0,
            ether('10'),
            fillWithMakingAmount('0'),
            resolver.address,
            settlement.address + '00' + trim0x(fusionDetails) + trim0x(fillOrderToData1),
        ]);

        const txn = await resolver.settleOrders(fillOrderToData0);
        await expect(txn).to.changeTokenBalances(weth, [addr, addr1], [ether('-0.025'), ether('0.025')]);
        await expect(txn).to.changeTokenBalances(dai, [addr, addr1], [ether('25'), ether('-25')]);
    });

    describe('dutch auction params', function () {
        const prepareSingleOrder = async ({
            orderStartTime,
            initialStartRate = 1000000n,
            duration = 1800,
            dai,
            weth,
            swap,
            settlement,
            resolver,
        }) => {
            const fusionDetails = await buildFusion({ resolvers: [resolver.address], timeStart: orderStartTime, initialRateBump: initialStartRate, duration });
            const order = await buildOrder({
                maker: addr1.address,
                makerAsset: dai.address,
                takerAsset: weth.address,
                makingAmount: ether('100'),
                takingAmount: ether('0.1'),
                makerTraits: buildMakerTraits({ allowedSender: settlement.address }),
            });
            order.salt = keccak256(fusionDetails);
            const { r, vs } = compactSignature(await signOrder(order, chainId, swap.address, addr1));

            let actualTakingAmount = ether('0.1');
            const ts = await time.latest();
            if (ts < orderStartTime + duration) {
                // actualTakingAmount = actualTakingAmount * (
                //    _BASE_POINTS + initialStartRate * (orderTime + duration - currentTimestamp) / duration
                // ) / _BASE_POINTS
                const minDuration = orderStartTime + duration - ts > duration ? duration : orderStartTime + duration - ts - 2;
                actualTakingAmount =
                    (actualTakingAmount * (10000000n + (BigInt(initialStartRate) * BigInt(minDuration)) / BigInt(duration))) /
                    10000000n;
                console.log(actualTakingAmount);
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

            const fillOrderToData = swap.interface.encodeFunctionData('fillOrderTo', [
                order,
                r,
                vs,
                ether('100'),
                fillWithMakingAmount('0'),
                resolver.address,
                settlement.address + '01' + trim0x(fusionDetails) + trim0x(resolverCalldata),
            ]);

            await weth.approve(resolver.address, actualTakingAmount);
            return fillOrderToData;
        };

        it('matching order before orderTime has maximal rate bump', async function () {
            const { dai, weth, swap, settlement, resolver } = await loadFixture(initContracts);

            const currentTimestamp = await time.latest();
            const fillOrderToData = await prepareSingleOrder({
                orderStartTime: currentTimestamp + 60,
                dai,
                weth,
                swap,
                settlement,
                resolver,
            });

            const txn = await resolver.settleOrders(fillOrderToData);
            await expect(txn).to.changeTokenBalances(dai, [resolver, addr1], [ether('100'), ether('-100')]);
            await expect(txn).to.changeTokenBalances(weth, [addr, addr1], [ether('-0.11'), ether('0.11')]);
        });

        describe('order with one bump point', async function () {
            async function prepareOrder({
                orderStartTime,
                initialStartRate = 1000000n,
                duration = 1800,
                dai,
                weth,
                swap,
                settlement,
                resolver,
            }) {
                const makerAsset = dai.address;
                const takerAsset = weth.address;
                const makingAmount = ether('100');
                const takingAmount = ether('0.1');

                const fusionDetails = await buildFusion({ resolvers: [resolver.address], timeStart: orderStartTime, initialRateBump: initialStartRate, duration, points: [[240, 900000n]] });
                const order = await buildOrder({
                    maker: addr1.address,
                    makerAsset,
                    takerAsset,
                    makingAmount,
                    takingAmount,
                    makerTraits: buildMakerTraits({ allowedSender: settlement.address }),
                });
                order.salt = keccak256(fusionDetails);

                const { r, vs } = compactSignature(await signOrder(order, chainId, swap.address, addr1));

                return {
                    order,
                    r,
                    vs,
                    makerAsset,
                    takerAsset,
                    makingAmount,
                    takingAmount,
                    fusionDetails,
                };
            }

            it('matching order before bump point', async function () {
                const { dai, weth, swap, settlement, resolver } = await loadFixture(initContracts);

                const currentTimestamp = await time.latest();
                const { order, r, vs, fusionDetails } = await prepareOrder({
                    orderStartTime: currentTimestamp,
                    dai,
                    weth,
                    swap,
                    settlement,
                    resolver,
                });

                const actualTakingAmount = ether('0.109');

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

                const fillOrderToData = swap.interface.encodeFunctionData('fillOrderTo', [
                    order,
                    r,
                    vs,
                    ether('100'),
                    fillWithMakingAmount('0'),
                    resolver.address,
                    settlement.address + '01' + trim0x(fusionDetails) + trim0x(resolverCalldata),
                ]);

                await weth.approve(resolver.address, actualTakingAmount);

                await timeIncreaseTo(currentTimestamp + 239);

                const txn = await resolver.settleOrders(fillOrderToData);
                await expect(txn).to.changeTokenBalances(dai, [resolver, addr1], [ether('100'), ether('-100')]);
                await expect(txn).to.changeTokenBalances(weth, [addr, addr1], [ether('-0.109'), ether('0.109')]);
            });

            it('matching order after bump point', async function () {
                const { dai, weth, swap, settlement, resolver } = await loadFixture(initContracts);

                const currentTimestamp = await time.latest();
                const { order, r, vs, fusionDetails } = await prepareOrder({
                    orderStartTime: currentTimestamp,
                    dai,
                    weth,
                    swap,
                    settlement,
                    resolver,
                });

                const actualTakingAmount = ether('0.106');
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

                const fillOrderToData = swap.interface.encodeFunctionData('fillOrderTo', [
                    order,
                    r,
                    vs,
                    ether('100'),
                    fillWithMakingAmount('0'),
                    resolver.address,
                    settlement.address + '01' + trim0x(fusionDetails) + trim0x(resolverCalldata),
                ]);

                await weth.approve(resolver.address, actualTakingAmount);

                await timeIncreaseTo(currentTimestamp + 759);

                const txn = await resolver.settleOrders(fillOrderToData);
                await expect(txn).to.changeTokenBalances(dai, [resolver, addr1], [ether('100'), ether('-100')]);
                await expect(txn).to.changeTokenBalances(weth, [addr, addr1], [ether('-0.106'), ether('0.106')]);
            });
        });

        it('set initial rate', async function () {
            const { dai, weth, swap, settlement, resolver } = await loadFixture(initContracts);

            const currentTimestamp = await time.latest();
            const fillOrderToData = await prepareSingleOrder({
                orderStartTime: currentTimestamp + 60,
                initialStartRate: 2000000n,
                dai,
                weth,
                swap,
                settlement,
                resolver,
            });

            const txn = await resolver.settleOrders(fillOrderToData);
            await expect(txn).to.changeTokenBalances(dai, [resolver, addr1], [ether('100'), ether('-100')]);
            await expect(txn).to.changeTokenBalances(weth, [addr, addr1], [ether('-0.12'), ether('0.12')]);
        });

        it('set duration', async function () {
            const { dai, weth, swap, settlement, resolver } = await loadFixture(initContracts);

            const currentTimestamp = await time.latest();
            const fillOrderToData = await prepareSingleOrder({
                orderStartTime: currentTimestamp - 448,
                initialStartRate: 1000000n,
                duration: 900,
                dai,
                weth,
                swap,
                settlement,
                resolver,
            });

            const txn = await resolver.settleOrders(fillOrderToData);
            await expect(txn).to.changeTokenBalances(dai, [resolver, addr1], [ether('100'), ether('-100')]);
            await expect(txn).to.changeTokenBalances(weth, [addr, addr1], [ether('-0.105'), ether('0.105')]);
        });
    });

    it('should change availableCredit with non-zero fee', async function () {
        const { dai, weth, swap, settlement, resolver } = await loadFixture(initContracts);

        const fusionDetailsOrder0 = await buildFusion({ resolvers: [resolver.address], resolverFee: orderFee });
        const order0 = await buildOrder({
            maker: addr.address,
            makerAsset: dai.address,
            takerAsset: weth.address,
            makingAmount: ether('100'),
            takingAmount: ether('0.1'),
            makerTraits: buildMakerTraits({ allowedSender: settlement.address }),
        });
        order0.salt = keccak256(fusionDetailsOrder0);

        const fusionDetailsOrder1 = await buildFusion({ resolvers: [resolver.address], resolverFee: backOrderFee });
        const order1 = await buildOrder({
            maker: addr1.address,
            makerAsset: weth.address,
            takerAsset: dai.address,
            makingAmount: ether('0.1'),
            takingAmount: ether('100'),
            makerTraits: buildMakerTraits({ allowedSender: settlement.address }),
        });
        order1.salt = keccak256(fusionDetailsOrder1);

        const { r: r0, vs: vs0 } = compactSignature(await signOrder(order0, chainId, swap.address, addr));
        const { r: r1, vs: vs1 } = compactSignature(await signOrder(order1, chainId, swap.address, addr1));

        const fillOrderToData1 = swap.interface.encodeFunctionData('fillOrderTo', [
            order1,
            r1,
            vs1,
            ether('0.1'),
            fillWithMakingAmount('0'),
            resolver.address,
            settlement.address + '01' + trim0x(fusionDetailsOrder1),
        ]);

        const fillOrderToData0 = swap.interface.encodeFunctionData('fillOrderTo', [
            order0,
            r0,
            vs0,
            ether('100'),
            fillWithMakingAmount('0'),
            resolver.address,
            settlement.address + '00' + trim0x(fusionDetailsOrder0) + trim0x(fillOrderToData1),
        ]);

        const availableCreditBefore = await settlement.availableCredit(resolver.address);
        await resolver.settleOrders(fillOrderToData0);
        expect(await settlement.availableCredit(resolver.address)).to.equal(
            availableCreditBefore.toBigInt() - basePoints * (orderFee + backOrderFee),
        );
    });

    it('should not change when availableCredit is not enough', async function () {
        const { dai, weth, swap, settlement, resolver } = await loadFixture(initContracts);

        const fusionDetailsOrder0 = await buildFusion({ resolvers: [resolver.address], resolverFee: '1000000' });
        const order0 = await buildOrder({
            maker: addr.address,
            makerAsset: dai.address,
            takerAsset: weth.address,
            makingAmount: ether('100'),
            takingAmount: ether('0.1'),
            makerTraits: buildMakerTraits({ allowedSender: settlement.address }),
        });
        order0.salt = keccak256(fusionDetailsOrder0);

        const fusionDetailsOrder1 = await buildFusion({ resolvers: [resolver.address], resolverFee: backOrderFee });
        const order1 = await buildOrder({
            maker: addr1.address,
            makerAsset: weth.address,
            takerAsset: dai.address,
            makingAmount: ether('0.1'),
            takingAmount: ether('100'),
            makerTraits: buildMakerTraits({ allowedSender: settlement.address }),
        });
        order1.salt = keccak256(fusionDetailsOrder1);

        const { r: r0, vs: vs0 } = compactSignature(await signOrder(order0, chainId, swap.address, addr));
        const { r: r1, vs: vs1 } = compactSignature(await signOrder(order1, chainId, swap.address, addr1));

        const fillOrderToData1 = swap.interface.encodeFunctionData('fillOrderTo', [
            order1,
            r1,
            vs1,
            ether('0.1'),
            fillWithMakingAmount('0'),
            resolver.address,
            settlement.address + '01' + trim0x(fusionDetailsOrder1),
        ]);

        const fillOrderToData0 = swap.interface.encodeFunctionData('fillOrderTo', [
            order0,
            r0,
            vs0,
            ether('100'),
            fillWithMakingAmount('0'),
            resolver.address,
            settlement.address + '00' + trim0x(fusionDetailsOrder0) + trim0x(fillOrderToData1),
        ]);

        await expect(resolver.settleOrders(fillOrderToData0)).to.be.revertedWithCustomError(settlement, 'NotEnoughCredit');
    });

    describe('whitelist lock period', async function () {
        it('should change only after whitelistedCutOff', async function () {
            const { dai, weth, swap, settlement, resolver } = await loadFixture(initContracts);

            const currentTime = await time.latest();
            const oneDay = time.duration.days('1');

            const fusionDetails = await buildFusion({ resolvers: [addr1.address, resolver.address], duration: oneDay * 2, resolverFee: orderFee });
            const order0 = await buildOrder({
                maker: addr.address,
                makerAsset: dai.address,
                takerAsset: weth.address,
                makingAmount: ether('100'),
                takingAmount: ether('0.1'),
                makerTraits: buildMakerTraits({ allowedSender: settlement.address }),
            });
            order0.salt = keccak256(fusionDetails);

            const order1 = await buildOrder({
                maker: addr1.address,
                makerAsset: weth.address,
                takerAsset: dai.address,
                makingAmount: ether('0.1'),
                takingAmount: ether('100'),
                makerTraits: buildMakerTraits({ allowedSender: settlement.address }),
            });
            order1.salt = keccak256(fusionDetails);

            const { r: r0, vs: vs0 } = compactSignature(await signOrder(order0, chainId, swap.address, addr));
            const { r: r1, vs: vs1 } = compactSignature(await signOrder(order1, chainId, swap.address, addr1));

            const fillOrderToData1 = swap.interface.encodeFunctionData('fillOrderTo', [
                order1,
                r1,
                vs1,
                ether('0.11'),
                fillWithMakingAmount('0'),
                resolver.address,
                settlement.address + '01' + trim0x(fusionDetails),
            ]);

            const fillOrderToData0 = swap.interface.encodeFunctionData('fillOrderTo', [
                order0,
                r0,
                vs0,
                ether('100'),
                fillWithMakingAmount('0'),
                resolver.address,
                settlement.address + '00' + trim0x(fusionDetails) + trim0x(fillOrderToData1),
            ]);

            await expect(resolver.settleOrders(fillOrderToData0)).to.be.revertedWithCustomError(settlement, 'ResolverIsNotWhitelisted');

            await timeIncreaseTo(currentTime + oneDay + 1);

            await resolver.settleOrders(fillOrderToData0);
        });

        it('should change by non-whitelisted resolver after publicCutOff', async function () {
            const { dai, weth, swap, settlement, resolver } = await loadFixture(initContracts);

            const fusionDetails0 = await buildFusion({ publicTimeLimit: BigInt(await time.latest()) + 60n, resolverFee: orderFee });

            const order0 = await buildOrder({
                maker: addr.address,
                makerAsset: dai.address,
                takerAsset: weth.address,
                makingAmount: ether('100'),
                takingAmount: ether('0.1'),
                makerTraits: buildMakerTraits({ allowedSender: settlement.address }),
            });
            order0.salt = keccak256(fusionDetails0);

            const fusionDetails1 = await buildFusion({ publicTimeLimit: BigInt(await time.latest()) + 60n, resolverFee: backOrderFee });
            const order1 = await buildOrder({
                maker: addr1.address,
                makerAsset: weth.address,
                takerAsset: dai.address,
                makingAmount: ether('0.1'),
                takingAmount: ether('100'),
                makerTraits: buildMakerTraits({ allowedSender: settlement.address }),
            });
            order1.salt = keccak256(fusionDetails1);

            const { r: r0, vs: vs0 } = compactSignature(await signOrder(order0, chainId, swap.address, addr));
            const { r: r1, vs: vs1 } = compactSignature(await signOrder(order1, chainId, swap.address, addr1));

            const fillOrderToData1 = swap.interface.encodeFunctionData('fillOrderTo', [
                order1,
                r1,
                vs1,
                ether('0.1'),
                fillWithMakingAmount('0'),
                resolver.address,
                settlement.address + '01' + trim0x(fusionDetails1),
            ]);

            const fillOrderToData0 = swap.interface.encodeFunctionData('fillOrderTo', [
                order0,
                r0,
                vs0,
                ether('100'),
                fillWithMakingAmount('0'),
                resolver.address,
                settlement.address + '00' + trim0x(fusionDetails0) + trim0x(fillOrderToData1),
            ]);

            await expect(resolver.settleOrders(fillOrderToData0)).to.be.revertedWithCustomError(settlement, 'ResolverIsNotWhitelisted');
            await timeIncreaseTo(BigInt(await time.latest()) + 100n);
            await resolver.settleOrders(fillOrderToData0);
        });
    });
});
