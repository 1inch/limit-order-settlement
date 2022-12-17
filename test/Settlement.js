const { assertRoughlyEqualValues, time, expect, ether, trim0x, timeIncreaseTo } = require('@1inch/solidity-utils');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { ethers } = require('hardhat');
const { deploySwapTokens, getChainId } = require('./helpers/fixtures');
const { buildOrder, signOrder, buildSalt, defaultExpiredAuctionTimestamp } = require('./helpers/orderUtils');

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
        const matcher = await SettlementMock.deploy(swap.address, inch.address);
        await matcher.deployed();

        const FeeBank = await ethers.getContractFactory('FeeBank');
        const feeBank = await FeeBank.attach(await matcher.feeBank());

        await inch.approve(feeBank.address, ether('100'));
        await feeBank.deposit(ether('100'));

        const ProxySettlement = await ethers.getContractFactory('ProxySettlement');
        const proxy = await ProxySettlement.deploy(matcher.address, inch.address, feeBank.address);
        await proxy.deployed();
        await inch.mint(proxy.address, ether('100'));

        const ResolverMock = await ethers.getContractFactory('ResolverMock');
        const resolver = await ResolverMock.deploy();

        return { dai, weth, swap, matcher, feeBank, proxy, resolver };
    }

    it('opposite direction recursive swap', async function () {
        const { dai, weth, swap, matcher, resolver } = await loadFixture(initContracts);

        const order = await buildOrder(
            {
                makerAsset: dai.address,
                takerAsset: weth.address,
                makingAmount: ether('100'),
                takingAmount: ether('0.1'),
                salt: buildSalt({ orderStartTime: await time.latest() }),
                from: addr.address,
            },
            {
                predicate: swap.interface.encodeFunctionData('timestampBelow', [0xff00000000]),
                whitelistedAddrs: [addr.address],
                whitelistedCutOffs: [0],
            },
        );

        const backOrder = await buildOrder(
            {
                makerAsset: weth.address,
                takerAsset: dai.address,
                makingAmount: ether('0.11'),
                takingAmount: ether('100'),
                from: addr1.address,
            },
            {
                predicate: swap.interface.encodeFunctionData('timestampBelow', [0xff00000000]),
                whitelistedAddrs: [addr.address],
                whitelistedCutOffs: [0],
            },
        );

        const signature = await signOrder(order, chainId, swap.address, addr);
        const signatureBackOrder = await signOrder(backOrder, chainId, swap.address, addr1);

        const matchingParams = matcher.address + '01' + trim0x(resolver.address);

        const interaction =
            matcher.address +
            '00' +
            swap.interface
                .encodeFunctionData('fillOrderTo', [
                    backOrder,
                    signatureBackOrder,
                    matchingParams,
                    ether('0.11'),
                    0,
                    ether('100'),
                    matcher.address,
                ])
                .substring(10);

        const addrweth = await weth.balanceOf(addr.address);
        const addr1weth = await weth.balanceOf(addr1.address);
        const addrdai = await dai.balanceOf(addr.address);
        const addr1dai = await dai.balanceOf(addr1.address);

        await matcher.settleOrders(
            '0x' + swap.interface.encodeFunctionData('fillOrderTo', [
                order,
                signature,
                interaction,
                ether('100'),
                0,
                ether('0.11'),
                matcher.address,
            ]).substring(10),
        );

        assertRoughlyEqualValues(await weth.balanceOf(addr.address), addrweth.add(ether('0.11')), 1e-4);
        // TODO: 6e-5 WETH lost into LimitOrderProtocol contract
        expect(await weth.balanceOf(addr1.address)).to.equal(addr1weth.sub(ether('0.11')));
        expect(await dai.balanceOf(addr.address)).to.equal(addrdai.sub(ether('100')));
        expect(await dai.balanceOf(addr1.address)).to.equal(addr1dai.add(ether('100')));
    });

    it('opposite direction recursive swap with taking fee', async function () {
        const { dai, weth, swap, matcher, resolver } = await loadFixture(initContracts);

        const order = await buildOrder(
            {
                makerAsset: dai.address,
                takerAsset: weth.address,
                makingAmount: ether('100'),
                takingAmount: ether('0.1'),
                salt: buildSalt({ orderStartTime: await time.latest() }),
                from: addr.address,
            },
            {
                predicate: swap.interface.encodeFunctionData('timestampBelow', [0xff00000000]),
                whitelistedAddrs: [addr.address],
                whitelistedCutOffs: [0],
                takerFeeReceiver: addr2.address,
                takerFeeRatio: 10000000n, // 1%
            },
        );

        const backOrder = await buildOrder(
            {
                makerAsset: weth.address,
                takerAsset: dai.address,
                makingAmount: ether('0.11'),
                takingAmount: ether('100'),
                from: addr1.address,
            },
            {
                predicate: swap.interface.encodeFunctionData('timestampBelow', [0xff00000000]),
                whitelistedAddrs: [addr.address],
                whitelistedCutOffs: [0],
                takerFeeReceiver: addr2.address,
                takerFeeRatio: 10000000n, // 1%
            },
        );

        const signature = await signOrder(order, chainId, swap.address, addr);
        const signatureBackOrder = await signOrder(backOrder, chainId, swap.address, addr1);

        const wethFeeAmount = ether('0.0011'); // (takingAmount + 10% auction) * fee
        const daiFeeAmount = ether('1');
        // send fee amounts to matcher contract
        await weth.transfer(matcher.address, wethFeeAmount.toString());
        await dai.connect(addr1).transfer(matcher.address, daiFeeAmount.toString());

        const matchingParams = matcher.address + '01' + trim0x(resolver.address);

        const interaction =
            matcher.address +
            '00' +
            swap.interface
                .encodeFunctionData('fillOrderTo', [
                    backOrder,
                    signatureBackOrder,
                    matchingParams,
                    ether('0.11'),
                    0,
                    ether('100'),
                    matcher.address,
                ])
                .substring(10);

        const addrweth = await weth.balanceOf(addr.address);
        const addr1weth = await weth.balanceOf(addr1.address);
        const addr2weth = await weth.balanceOf(addr2.address);
        const addrdai = await dai.balanceOf(addr.address);
        const addr1dai = await dai.balanceOf(addr1.address);
        const addr2dai = await dai.balanceOf(addr2.address);

        await matcher.settleOrders(
            '0x' + swap.interface.encodeFunctionData('fillOrderTo', [
                order,
                signature,
                interaction,
                ether('100'),
                0,
                ether('0.11'),
                matcher.address,
            ]).substring(10),
        );

        assertRoughlyEqualValues(await weth.balanceOf(addr.address), addrweth.add(ether('0.11')), 1e-3);
        // TODO: 6e-5 WETH lost into LimitOrderProtocol contract
        expect(await weth.balanceOf(addr1.address)).to.equal(addr1weth.sub(ether('0.11')));
        expect(await dai.balanceOf(addr.address)).to.equal(addrdai.sub(ether('100')));
        expect(await dai.balanceOf(addr1.address)).to.equal(addr1dai.add(ether('100')));
        assertRoughlyEqualValues(await weth.balanceOf(addr2.address), addr2weth.add(wethFeeAmount), 1e-2);
        assertRoughlyEqualValues(await dai.balanceOf(addr2.address), addr2dai.add(daiFeeAmount), 1e-2);
    });

    it('unidirectional recursive swap', async function () {
        const { dai, weth, swap, matcher, resolver } = await loadFixture(initContracts);

        const order = await buildOrder(
            {
                makerAsset: dai.address,
                takerAsset: weth.address,
                makingAmount: ether('10'),
                takingAmount: ether('0.01'),
                salt: buildSalt({ orderStartTime: await time.latest() }),
                from: addr1.address,
            },
            {
                predicate: swap.interface.encodeFunctionData('timestampBelow', [0xff00000000]),
                whitelistedAddrs: [addr.address],
                whitelistedCutOffs: [0],
            },
        );

        const backOrder = await buildOrder(
            {
                makerAsset: dai.address,
                takerAsset: weth.address,
                makingAmount: ether('15'),
                takingAmount: ether('0.015'),
                salt: buildSalt({ orderStartTime: await time.latest() }),
                from: addr1.address,
            },
            {
                predicate: swap.interface.encodeFunctionData('timestampBelow', [0xff00000000]),
                whitelistedAddrs: [addr.address],
                whitelistedCutOffs: [0],
            },
        );

        const signature = await signOrder(order, chainId, swap.address, addr1);
        const signatureBackOrder = await signOrder(backOrder, chainId, swap.address, addr1);

        const matchingParams =
            matcher.address +
            '01' +
            trim0x(resolver.address) +
            trim0x(abiCoder.encode(['address[]', 'bytes[]'], [
                [weth.address, dai.address],
                [
                    weth.interface.encodeFunctionData('transferFrom', [
                        addr.address,
                        matcher.address,
                        ether('0.0275'),
                    ]),
                    dai.interface.encodeFunctionData('transfer', [
                        addr.address,
                        ether('25'),
                    ]),
                ],
            ]));

        const interaction =
            matcher.address +
            '00' +
            swap.interface
                .encodeFunctionData('fillOrderTo', [
                    backOrder,
                    signatureBackOrder,
                    matchingParams,
                    ether('15'),
                    0,
                    ether('0.015'),
                    resolver.address,
                ])
                .substring(10);

        const addrweth = await weth.balanceOf(addr.address);
        const addr1weth = await weth.balanceOf(addr1.address);
        const addrdai = await dai.balanceOf(addr.address);
        const addr1dai = await dai.balanceOf(addr1.address);

        await weth.approve(resolver.address, ether('0.0275'));
        await matcher.settleOrders(
            '0x' + swap.interface.encodeFunctionData('fillOrderTo', [
                order,
                signature,
                interaction,
                ether('10'),
                0,
                ether('0.01'),
                resolver.address,
            ]).substring(10),
        );

        expect(await weth.balanceOf(addr.address)).to.equal(addrweth.sub(ether('0.0275')));
        assertRoughlyEqualValues(await weth.balanceOf(addr1.address), addr1weth.add(ether('0.0275')), 1e-4);
        // TODO: 3e-5 WETH lost into LimitOrderProtocol contract
        expect(await dai.balanceOf(addr.address)).to.equal(addrdai.add(ether('25')));
        expect(await dai.balanceOf(addr1.address)).to.equal(addr1dai.sub(ether('25')));
    });

    it('triple recursive swap', async function () {
        const { dai, weth, swap, matcher, resolver } = await loadFixture(initContracts);

        const order1 = await buildOrder(
            {
                makerAsset: dai.address,
                takerAsset: weth.address,
                makingAmount: ether('10'),
                takingAmount: ether('0.01'),
                salt: buildSalt({ orderStartTime: await time.latest() }),
                from: addr1.address,
            },
            {
                predicate: swap.interface.encodeFunctionData('timestampBelow', [0xff00000000]),
                whitelistedAddrs: [addr.address],
                whitelistedCutOffs: [0],
            },
        );

        const order2 = await buildOrder(
            {
                makerAsset: dai.address,
                takerAsset: weth.address,
                makingAmount: ether('15'),
                takingAmount: ether('0.015'),
                salt: buildSalt({ orderStartTime: await time.latest() }),
                from: addr1.address,
            },
            {
                predicate: swap.interface.encodeFunctionData('timestampBelow', [0xff00000000]),
                whitelistedAddrs: [addr.address],
                whitelistedCutOffs: [0],
            },
        );

        const backOrder = await buildOrder(
            {
                makerAsset: weth.address,
                takerAsset: dai.address,
                makingAmount: ether('0.0275'),
                takingAmount: ether('25'),
                from: addr.address,
            },
            {
                predicate: swap.interface.encodeFunctionData('timestampBelow', [0xff00000000]),
                whitelistedAddrs: [addr.address],
                whitelistedCutOffs: [0],
            },
        );

        const signature1 = await signOrder(order1, chainId, swap.address, addr1);
        const signature2 = await signOrder(order2, chainId, swap.address, addr1);
        const signatureBackOrder = await signOrder(backOrder, chainId, swap.address, addr);

        const matchingParams = matcher.address + '01' + trim0x(resolver.address);

        const internalInteraction =
            matcher.address +
            '00' +
            swap.interface
                .encodeFunctionData('fillOrderTo', [
                    backOrder,
                    signatureBackOrder,
                    matchingParams,
                    ether('0.0275'),
                    0,
                    ether('25'),
                    matcher.address,
                ])
                .substring(10);

        const externalInteraction =
            matcher.address +
            '00' +
            swap.interface
                .encodeFunctionData('fillOrderTo', [
                    order2,
                    signature2,
                    internalInteraction,
                    ether('15'),
                    0,
                    ether('0.015'),
                    matcher.address,
                ])
                .substring(10);

        const addrweth = await weth.balanceOf(addr.address);
        const addr1weth = await weth.balanceOf(addr1.address);
        const addrdai = await dai.balanceOf(addr.address);
        const addr1dai = await dai.balanceOf(addr1.address);

        await matcher.settleOrders(
            '0x' + swap.interface.encodeFunctionData('fillOrderTo', [
                order1,
                signature1,
                externalInteraction,
                ether('10'),
                0,
                ether('0.01'),
                matcher.address,
            ]).substring(10),
        );

        expect(await weth.balanceOf(addr.address)).to.equal(addrweth.sub(ether('0.0275')));
        assertRoughlyEqualValues(await weth.balanceOf(addr1.address), addr1weth.add(ether('0.0275')), 1e-4);
        // TODO: 15e-6 WETH lost into LimitOrderProtocol contract
        expect(await dai.balanceOf(addr.address)).to.equal(addrdai.add(ether('25')));
        expect(await dai.balanceOf(addr1.address)).to.equal(addr1dai.sub(ether('25')));
    });

    describe('dutch auction params', function () {
        const prepareSingleOrder = async ({
            orderStartTime,
            initialStartRate = '1000',
            duration = '1800',
            salt = '1',
            dai,
            weth,
            swap,
            matcher,
            resolver,
        }) => {
            const makerAsset = dai.address;
            const takerAsset = weth.address;
            const makingAmount = ether('100');
            const takingAmount = ether('0.1');
            const order = await buildOrder(
                {
                    salt: buildSalt({ orderStartTime, initialStartRate, duration, salt }),
                    makerAsset,
                    takerAsset,
                    makingAmount,
                    takingAmount,
                    from: addr1.address,
                },
                {
                    predicate: swap.interface.encodeFunctionData('timestampBelow', [0xff00000000]),
                    whitelistedAddrs: [addr.address],
                    whitelistedCutOffs: [0],
                },
            );
            const signature = await signOrder(order, chainId, swap.address, addr1);

            let actualTakingAmount = BigInt(takingAmount.toString());
            const ts = BigInt(await time.latest());
            if (ts < orderStartTime + BigInt(duration)) {
                // actualTakingAmount = actualTakingAmount * (
                //    _BASE_POINTS + initialStartRate * (orderTime + duration - currentTimestamp) / duration
                // ) / _BASE_POINTS
                const minDuration =
                    orderStartTime + BigInt(duration) - ts > BigInt(duration)
                        ? BigInt(duration)
                        : orderStartTime + BigInt(duration) - ts;
                actualTakingAmount =
                    (actualTakingAmount *
                        (BigInt('10000') + (BigInt(initialStartRate) * minDuration) / BigInt(duration))) /
                    BigInt('10000');
            }

            const matchingParams =
                matcher.address +
                '01' +
                trim0x(resolver.address) +
                trim0x(abiCoder.encode(['address[]', 'bytes[]'], [
                    [weth.address, dai.address],
                    [
                        weth.interface.encodeFunctionData('transferFrom', [
                            addr.address,
                            matcher.address,
                            actualTakingAmount,
                        ]),
                        dai.interface.encodeFunctionData('transfer', [addr.address, makingAmount]),
                    ],
                ]));

            await weth.approve(resolver.address, actualTakingAmount);
            return {
                order,
                signature,
                interaction: matchingParams,
                makerAsset,
                takerAsset,
                makingAmount,
                takingAmount,
            };
        };

        it('matching order before orderTime has maximal rate bump', async function () {
            const { dai, weth, swap, matcher, resolver } = await loadFixture(initContracts);

            const currentTimestamp = BigInt(await time.latest());
            const { order, signature, interaction, makingAmount, takingAmount } = await prepareSingleOrder({
                orderStartTime: currentTimestamp + BigInt(60),
                dai,
                weth,
                swap,
                matcher,
                resolver,
            });

            const addrweth = await weth.balanceOf(addr.address);
            const addr1weth = await weth.balanceOf(addr1.address);
            const addrDai = await dai.balanceOf(addr.address);
            const addr1Dai = await dai.balanceOf(addr1.address);

            await matcher.settleOrders(
                '0x' + swap.interface.encodeFunctionData('fillOrderTo', [
                    order,
                    signature,
                    interaction,
                    makingAmount,
                    0,
                    takingAmount,
                    resolver.address,
                ]).substring(10),
            );

            expect(await weth.balanceOf(addr1.address)).to.equal(addr1weth.add(ether('0.11')));
            expect(await weth.balanceOf(addr.address)).to.equal(addrweth.sub(ether('0.11')));
            expect(await dai.balanceOf(addr1.address)).to.equal(addr1Dai.sub(ether('100')));
            expect(await dai.balanceOf(addr.address)).to.equal(addrDai.add(ether('100')));
        });

        describe('order with one bump point', async function () {
            async function prepareOrder({
                orderStartTime,
                initialStartRate = '1000',
                duration = '1800',
                salt = '1',
                dai,
                weth,
                swap,
            }) {
                const makerAsset = dai.address;
                const takerAsset = weth.address;
                const makingAmount = ether('100');
                const takingAmount = ether('0.1');
                const order = await buildOrder(
                    {
                        salt: buildSalt({ orderStartTime, initialStartRate, duration, salt }),
                        makerAsset,
                        takerAsset,
                        makingAmount,
                        takingAmount,
                        from: addr1.address,
                    },
                    {
                        predicate: swap.interface.encodeFunctionData('timestampBelow', [0xff00000000]),
                        whitelistedAddrs: [addr.address],
                        whitelistedCutOffs: [0],
                        auctionBumps: [900],
                        auctionDelays: [240],
                    },
                );
                const signature = await signOrder(order, chainId, swap.address, addr1);
                return {
                    order,
                    signature,
                    makerAsset,
                    takerAsset,
                    makingAmount,
                    takingAmount,
                };
            }

            it('matching order before bump point', async function () {
                const { dai, weth, swap, matcher, resolver } = await loadFixture(initContracts);

                const currentTimestamp = BigInt(await time.latest());
                const { order, signature, makingAmount, takingAmount } = await prepareOrder({
                    orderStartTime: currentTimestamp,
                    dai,
                    weth,
                    swap,
                });

                const actualTakingAmount = ether('0.109');

                const interaction =
                    matcher.address +
                    '01' +
                    trim0x(resolver.address) +
                    trim0x(abiCoder.encode(['address[]', 'bytes[]'], [
                        [weth.address, dai.address],
                        [
                            weth.interface.encodeFunctionData('transferFrom', [
                                addr.address,
                                matcher.address,
                                actualTakingAmount,
                            ]),
                            dai.interface.encodeFunctionData('transfer', [addr.address, makingAmount]),
                        ],
                    ]));
                await weth.approve(resolver.address, actualTakingAmount);

                await timeIncreaseTo(currentTimestamp + 239n);

                const addrweth = await weth.balanceOf(addr.address);
                const addr1weth = await weth.balanceOf(addr1.address);
                const addrDai = await dai.balanceOf(addr.address);
                const addr1Dai = await dai.balanceOf(addr1.address);

                await matcher.settleOrders(
                    '0x' + swap.interface.encodeFunctionData('fillOrderTo', [
                        order,
                        signature,
                        interaction,
                        makingAmount,
                        0,
                        takingAmount,
                        resolver.address,
                    ]).substring(10),
                );

                expect(await weth.balanceOf(addr1.address)).to.equal(addr1weth.add(ether('0.109')));
                expect(await weth.balanceOf(addr.address)).to.equal(addrweth.sub(ether('0.109')));
                expect(await dai.balanceOf(addr1.address)).to.equal(addr1Dai.sub(ether('100')));
                expect(await dai.balanceOf(addr.address)).to.equal(addrDai.add(ether('100')));
            });

            it('matching order after bump point', async function () {
                const { dai, weth, swap, matcher, resolver } = await loadFixture(initContracts);

                const currentTimestamp = BigInt(await time.latest());
                const { order, signature, makingAmount, takingAmount } = await prepareOrder({
                    orderStartTime: currentTimestamp,
                    dai,
                    weth,
                    swap,
                });

                const actualTakingAmount = ether('0.106');

                const interaction =
                    matcher.address +
                    '01' +
                    trim0x(resolver.address) +
                    trim0x(abiCoder.encode(['address[]', 'bytes[]'], [
                        [weth.address, dai.address],
                        [
                            weth.interface.encodeFunctionData('transferFrom', [
                                addr.address,
                                matcher.address,
                                actualTakingAmount,
                            ]),
                            dai.interface.encodeFunctionData('transfer', [addr.address, makingAmount]),
                        ],
                    ]));
                await weth.approve(resolver.address, actualTakingAmount);

                await timeIncreaseTo(currentTimestamp + 759n);

                const addrweth = await weth.balanceOf(addr.address);
                const addr1weth = await weth.balanceOf(addr1.address);
                const addrDai = await dai.balanceOf(addr.address);
                const addr1Dai = await dai.balanceOf(addr1.address);

                await matcher.settleOrders(
                    '0x' + swap.interface.encodeFunctionData('fillOrderTo', [
                        order,
                        signature,
                        interaction,
                        makingAmount,
                        0,
                        takingAmount,
                        resolver.address,
                    ]).substring(10),
                );

                expect(await weth.balanceOf(addr1.address)).to.equal(addr1weth.add(ether('0.106')));
                expect(await weth.balanceOf(addr.address)).to.equal(addrweth.sub(ether('0.106')));
                expect(await dai.balanceOf(addr1.address)).to.equal(addr1Dai.sub(ether('100')));
                expect(await dai.balanceOf(addr.address)).to.equal(addrDai.add(ether('100')));
            });
        });

        it('set initial rate', async function () {
            const { dai, weth, swap, matcher, resolver } = await loadFixture(initContracts);

            const currentTimestamp = BigInt(await time.latest());
            const { order, signature, interaction, makingAmount, takingAmount } = await prepareSingleOrder({
                orderStartTime: currentTimestamp,
                initialStartRate: '2000',
                dai,
                weth,
                swap,
                matcher,
                resolver,
            });

            const addrweth = await weth.balanceOf(addr.address);
            const addr1weth = await weth.balanceOf(addr1.address);
            const addrDai = await dai.balanceOf(addr.address);
            const addr1Dai = await dai.balanceOf(addr1.address);

            await matcher.settleOrders(
                '0x' + swap.interface.encodeFunctionData('fillOrderTo', [
                    order,
                    signature,
                    interaction,
                    makingAmount,
                    0,
                    takingAmount,
                    resolver.address,
                ]).substring(10),
            );

            expect(await weth.balanceOf(addr.address)).to.equal(addrweth.sub(ether('0.12')));
            assertRoughlyEqualValues(await weth.balanceOf(addr1.address), addr1weth.add(ether('0.12')), 1e-4);
            expect(await dai.balanceOf(addr1.address)).to.equal(addr1Dai.sub(ether('100')));
            expect(await dai.balanceOf(addr.address)).to.equal(addrDai.add(ether('100')));
        });

        it('set duration', async function () {
            const { dai, weth, swap, matcher, resolver } = await loadFixture(initContracts);

            const currentTimestamp = BigInt(await time.latest());
            const { order, signature, interaction, makingAmount, takingAmount } = await prepareSingleOrder({
                orderStartTime: currentTimestamp - BigInt(450),
                initialStartRate: '1000',
                duration: '900',
                dai,
                weth,
                swap,
                matcher,
                resolver,
            });

            const addrweth = await weth.balanceOf(addr.address);
            const addr1weth = await weth.balanceOf(addr1.address);
            const addrDai = await dai.balanceOf(addr.address);
            const addr1Dai = await dai.balanceOf(addr1.address);

            await matcher.settleOrders(
                '0x' + swap.interface.encodeFunctionData('fillOrderTo', [
                    order,
                    signature,
                    interaction,
                    makingAmount,
                    0,
                    takingAmount,
                    resolver.address,
                ]).substring(10),
            );

            expect(await weth.balanceOf(addr.address)).to.equal(addrweth.sub(ether('0.105')));
            assertRoughlyEqualValues(await weth.balanceOf(addr1.address), addr1weth.add(ether('0.105')), 1e-4);
            expect(await dai.balanceOf(addr1.address)).to.equal(addr1Dai.sub(ether('100')));
            expect(await dai.balanceOf(addr.address)).to.equal(addrDai.add(ether('100')));
        });
    });

    it('should change availableCredit with non-zero fee', async function () {
        const { dai, weth, swap, matcher, resolver } = await loadFixture(initContracts);

        const order = await buildOrder(
            {
                salt: buildSalt({ orderStartTime: await defaultExpiredAuctionTimestamp(), fee: orderFee }),
                makerAsset: dai.address,
                takerAsset: weth.address,
                makingAmount: ether('100'),
                takingAmount: ether('0.1'),
                from: addr.address,
            },
            {
                whitelistedAddrs: [addr.address],
                whitelistedCutOffs: [0],
            },
        );
        const backOrder = await buildOrder(
            {
                salt: buildSalt({ orderStartTime: await defaultExpiredAuctionTimestamp(), fee: backOrderFee }),
                makerAsset: weth.address,
                takerAsset: dai.address,
                makingAmount: ether('0.1'),
                takingAmount: ether('100'),
                from: addr1.address,
            },
            {
                whitelistedAddrs: [addr.address],
                whitelistedCutOffs: [0],
            },
        );
        const signature = await signOrder(order, chainId, swap.address, addr);
        const signatureBackOrder = await signOrder(backOrder, chainId, swap.address, addr1);

        const matchingParams = matcher.address + '01' + trim0x(resolver.address);

        const interaction =
            matcher.address +
            '00' +
            swap.interface
                .encodeFunctionData('fillOrderTo', [
                    backOrder,
                    signatureBackOrder,
                    matchingParams,
                    ether('0.1'),
                    0,
                    ether('100'),
                    matcher.address,
                ])
                .substring(10);
        const availableCreditBefore = await matcher.availableCredit(addr.address);
        await matcher.settleOrders(
            '0x' + swap.interface.encodeFunctionData('fillOrderTo', [
                order,
                signature,
                interaction,
                ether('100'),
                0,
                ether('0.1'),
                matcher.address,
            ]).substring(10),
        );
        expect(await matcher.availableCredit(addr.address)).to.equal(
            availableCreditBefore.toBigInt() - basePoints * (orderFee + backOrderFee),
        );
    });

    it('should change availableCredit with non-zero fee, proxy contract', async function () {
        const { dai, weth, swap, matcher, proxy, resolver } = await loadFixture(initContracts);

        const order = await buildOrder(
            {
                salt: buildSalt({ orderStartTime: await defaultExpiredAuctionTimestamp(), fee: orderFee }),
                makerAsset: dai.address,
                takerAsset: weth.address,
                makingAmount: ether('100'),
                takingAmount: ether('0.1'),
                from: addr.address,
            },
            {
                whitelistedAddrs: [proxy.address],
                whitelistedCutOffs: [0],
            },
        );
        const backOrder = await buildOrder(
            {
                salt: buildSalt({ orderStartTime: await defaultExpiredAuctionTimestamp(), fee: backOrderFee }),
                makerAsset: weth.address,
                takerAsset: dai.address,
                makingAmount: ether('0.1'),
                takingAmount: ether('100'),
                from: addr1.address,
            },
            {
                whitelistedAddrs: [proxy.address],
                whitelistedCutOffs: [0],
            },
        );
        const signature = await signOrder(order, chainId, swap.address, addr);
        const signatureBackOrder = await signOrder(backOrder, chainId, swap.address, addr1);

        const matchingParams = matcher.address + '01' + trim0x(resolver.address);

        const interaction =
            matcher.address +
            '00' +
            swap.interface
                .encodeFunctionData('fillOrderTo', [
                    backOrder,
                    signatureBackOrder,
                    matchingParams,
                    ether('0.1'),
                    0,
                    ether('100'),
                    matcher.address,
                ])
                .substring(10);
        await proxy.deposit(ether('100'));
        const availableCreditBefore = await matcher.availableCredit(proxy.address);
        await proxy.settleOrders(
            '0x' + swap.interface.encodeFunctionData('fillOrderTo', [
                order,
                signature,
                interaction,
                ether('100'),
                0,
                ether('0.1'),
                matcher.address,
            ]).substring(10),
        );
        expect(await matcher.availableCredit(proxy.address)).to.equal(
            availableCreditBefore.toBigInt() - basePoints * (orderFee + backOrderFee),
        );
    });

    it('should not change when availableCredit is not enough', async function () {
        const { dai, weth, swap, matcher, resolver } = await loadFixture(initContracts);

        const order = await buildOrder(
            {
                salt: buildSalt({ orderStartTime: await defaultExpiredAuctionTimestamp(), fee: ether('1000') }),
                makerAsset: dai.address,
                takerAsset: weth.address,
                makingAmount: ether('100'),
                takingAmount: ether('0.1'),
                from: addr.address,
            },
            {
                whitelistedAddrs: [addr.address],
                whitelistedCutOffs: [0],
            },
        );
        const backOrder = await buildOrder(
            {
                salt: buildSalt({ orderStartTime: await defaultExpiredAuctionTimestamp(), fee: backOrderFee }),
                makerAsset: weth.address,
                takerAsset: dai.address,
                makingAmount: ether('0.1'),
                takingAmount: ether('100'),
                from: addr1.address,
            },
            {
                whitelistedAddrs: [addr.address],
                whitelistedCutOffs: [0],
            },
        );
        const signature = await signOrder(order, chainId, swap.address, addr);
        const signatureBackOrder = await signOrder(backOrder, chainId, swap.address, addr1);

        const matchingParams = matcher.address + '01' + trim0x(resolver.address);

        const interaction =
            matcher.address +
            '00' +
            swap.interface
                .encodeFunctionData('fillOrderTo', [
                    backOrder,
                    signatureBackOrder,
                    matchingParams,
                    ether('0.1'),
                    0,
                    ether('100'),
                    matcher.address,
                ])
                .substring(10);
        await expect(
            matcher.settleOrders(
                '0x' + swap.interface.encodeFunctionData('fillOrderTo', [
                    order,
                    signature,
                    interaction,
                    ether('100'),
                    0,
                    ether('0.1'),
                    matcher.address,
                ]).substring(10),
            ),
        ).to.be.revertedWithCustomError(matcher, 'NotEnoughCredit');
    });

    describe('whitelist lock period', async function () {
        it('should change only after whitelistedCutOff', async function () {
            const { dai, weth, swap, matcher, resolver } = await loadFixture(initContracts);

            const currentTime = BigInt(await time.latest());
            const oneWeek = BigInt(time.duration.weeks('1'));
            const order = await buildOrder(
                {
                    salt: buildSalt({ orderStartTime: await defaultExpiredAuctionTimestamp(), fee: orderFee }),
                    makerAsset: dai.address,
                    takerAsset: weth.address,
                    makingAmount: ether('100'),
                    takingAmount: ether('0.1'),
                    from: addr.address,
                },
                {
                    whitelistedAddrs: [addr.address],
                    whitelistedCutOffs: [currentTime + oneWeek],
                    publicCutOff: currentTime + oneWeek * 20n,
                },
            );
            const backOrder = await buildOrder(
                {
                    salt: buildSalt({ orderStartTime: await defaultExpiredAuctionTimestamp(), fee: backOrderFee }),
                    makerAsset: weth.address,
                    takerAsset: dai.address,
                    makingAmount: ether('0.1'),
                    takingAmount: ether('100'),
                    from: addr1.address,
                },
                {
                    whitelistedAddrs: [addr.address],
                    whitelistedCutOffs: [currentTime + oneWeek],
                    publicCutOff: currentTime + oneWeek * 20n,
                },
            );
            const signature = await signOrder(order, chainId, swap.address, addr);
            const signatureBackOrder = await signOrder(backOrder, chainId, swap.address, addr1);

            const matchingParams = matcher.address + '01' + trim0x(resolver.address);

            const interaction =
                matcher.address +
                '00' +
                swap.interface
                    .encodeFunctionData('fillOrderTo', [
                        backOrder,
                        signatureBackOrder,
                        matchingParams,
                        ether('0.1'),
                        0,
                        ether('100'),
                        matcher.address,
                    ])
                    .substring(10);

            await expect(
                matcher.settleOrders(
                    '0x' + swap.interface.encodeFunctionData('fillOrderTo', [
                        order,
                        signature,
                        interaction,
                        ether('100'),
                        0,
                        ether('0.1'),
                        matcher.address,
                    ]).substring(10),
                ),
            ).to.be.revertedWithCustomError(matcher, 'ResolverIsNotWhitelisted');
            await timeIncreaseTo(currentTime + oneWeek + 1n);
            await matcher.settleOrders(
                '0x' + swap.interface.encodeFunctionData('fillOrderTo', [
                    order,
                    signature,
                    interaction,
                    ether('100'),
                    0,
                    ether('0.1'),
                    matcher.address,
                ]).substring(10),
            );
        });

        it('should change by non-whitelisted resolver after publicCutOff', async function () {
            const { dai, weth, swap, matcher, resolver } = await loadFixture(initContracts);

            const order = await buildOrder(
                {
                    salt: buildSalt({ orderStartTime: await defaultExpiredAuctionTimestamp(), fee: orderFee }),
                    makerAsset: dai.address,
                    takerAsset: weth.address,
                    makingAmount: ether('100'),
                    takingAmount: ether('0.1'),
                    from: addr.address,
                },
                {
                    whitelistedAddrs: [addr1.address],
                    whitelistedCutOffs: [0],
                    publicCutOff: BigInt(await time.latest()) + 60n,
                },
            );
            const backOrder = await buildOrder(
                {
                    salt: buildSalt({ orderStartTime: await defaultExpiredAuctionTimestamp(), fee: backOrderFee }),
                    makerAsset: weth.address,
                    takerAsset: dai.address,
                    makingAmount: ether('0.1'),
                    takingAmount: ether('100'),
                    from: addr1.address,
                },
                {
                    whitelistedAddrs: [addr1.address],
                    whitelistedCutOffs: [0],
                    publicCutOff: BigInt(await time.latest()) + 60n,
                },
            );
            const signature = await signOrder(order, chainId, swap.address, addr);
            const signatureBackOrder = await signOrder(backOrder, chainId, swap.address, addr1);

            const matchingParams = matcher.address + '01' + trim0x(resolver.address);

            const interaction =
                matcher.address +
                '00' +
                swap.interface
                    .encodeFunctionData('fillOrderTo', [
                        backOrder,
                        signatureBackOrder,
                        matchingParams,
                        ether('0.1'),
                        0,
                        ether('100'),
                        matcher.address,
                    ])
                    .substring(10);

            await expect(
                matcher.settleOrders(
                    '0x' + swap.interface.encodeFunctionData('fillOrderTo', [
                        order,
                        signature,
                        interaction,
                        ether('100'),
                        0,
                        ether('0.1'),
                        matcher.address,
                    ]).substring(10),
                ),
            ).to.be.revertedWithCustomError(matcher, 'ResolverIsNotWhitelisted');
            await timeIncreaseTo(BigInt(await time.latest()) + 100n);
            await matcher.settleOrders(
                '0x' + swap.interface.encodeFunctionData('fillOrderTo', [
                    order,
                    signature,
                    interaction,
                    ether('100'),
                    0,
                    ether('0.1'),
                    matcher.address,
                ]).substring(10),
            );
        });
    });
});
