const { assertRoughlyEqualValues, time, expect } = require('@1inch/solidity-utils');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { ethers } = require('hardhat');
const { ether } = require('./helpers/orderUtils');
const { deploySwapTokens, deploySimpleRegistry, getChainId } = require('./helpers/fixtures');
const { buildOrder, signOrder, buildSalt, defaultExpiredAuctionTimestamp } = require('./helpers/orderUtils');

const Status = Object.freeze({
    Unverified: 0,
    Verified: 1,
});

describe('Settlement', function () {
    const basePoints = ether('0.001'); // 1e15
    let addr, addr1;
    let chainId;
    let whitelistRegistrySimple;
    const abiCoder = ethers.utils.defaultAbiCoder;

    before(async function () {
        chainId = await getChainId();
        whitelistRegistrySimple = await deploySimpleRegistry();
        [addr, addr1] = await ethers.getSigners();
        await whitelistRegistrySimple.setStatus(addr.address, Status.Verified);
        await whitelistRegistrySimple.setStatus(addr1.address, Status.Verified);
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

        const Settlement = await ethers.getContractFactory('Settlement');
        const matcher = await Settlement.deploy(whitelistRegistrySimple.address, swap.address);
        await matcher.deployed();

        const FeeBank = await ethers.getContractFactory('FeeBank');
        const feeBank = await FeeBank.deploy(matcher.address, inch.address);
        await feeBank.deployed();

        await matcher.setFeeBank(feeBank.address);
        await inch.approve(feeBank.address, ether('100'));
        await feeBank.deposit(ether('100'));

        const ProxySettlement = await ethers.getContractFactory('ProxySettlement');
        const proxy = await ProxySettlement.deploy(matcher.address, inch.address, feeBank.address);
        await proxy.deployed();
        await inch.mint(proxy.address, ether('100'));

        return { dai, weth, swap, matcher, feeBank, proxy };
    }

    it('opposite direction recursive swap', async function () {
        const { dai, weth, swap, matcher } = await loadFixture(initContracts);

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
            },
        );

        const signature = await signOrder(order, chainId, swap.address, addr);
        const signatureBackOrder = await signOrder(backOrder, chainId, swap.address, addr1);

        const matchingParams =
            matcher.address +
            '01' +
            abiCoder
                .encode(
                    ['address[]', 'bytes[]'],
                    [
                        [weth.address, dai.address],
                        [
                            weth.interface.encodeFunctionData('approve', [swap.address, ether('0.11')]),
                            dai.interface.encodeFunctionData('approve', [swap.address, ether('100.00')]),
                        ],
                    ],
                )
                .substring(2);

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
            swap.address,
            order,
            signature,
            interaction,
            ether('100'),
            0,
            ether('0.11'),
            matcher.address,
        );

        assertRoughlyEqualValues(await weth.balanceOf(addr.address), addrweth.add(ether('0.11')), 1e-4);
        // TODO: 6e-5 WETH lost into LimitOrderProtocol contract
        expect(await weth.balanceOf(addr1.address)).to.equal(addr1weth.sub(ether('0.11')));
        expect(await dai.balanceOf(addr.address)).to.equal(addrdai.sub(ether('100')));
        expect(await dai.balanceOf(addr1.address)).to.equal(addr1dai.add(ether('100')));
    });

    it('unidirectional recursive swap', async function () {
        const { dai, weth, swap, matcher } = await loadFixture(initContracts);

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
            },
        );

        const signature = await signOrder(order, chainId, swap.address, addr1);
        const signatureBackOrder = await signOrder(backOrder, chainId, swap.address, addr1);

        const matchingParams =
            matcher.address +
            '01' +
            abiCoder
                .encode(
                    ['address[]', 'bytes[]'],
                    [
                        [weth.address, weth.address, dai.address],
                        [
                            weth.interface.encodeFunctionData('transferFrom', [
                                addr.address,
                                matcher.address,
                                ether('0.0275'),
                            ]),
                            weth.interface.encodeFunctionData('approve', [swap.address, ether('0.0275')]),
                            dai.interface.encodeFunctionData('transfer', [addr.address, ether('25')]),
                        ],
                    ],
                )
                .substring(2);

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
                    matcher.address,
                ])
                .substring(10);

        const addrweth = await weth.balanceOf(addr.address);
        const addr1weth = await weth.balanceOf(addr1.address);
        const addrdai = await dai.balanceOf(addr.address);
        const addr1dai = await dai.balanceOf(addr1.address);

        await weth.approve(matcher.address, ether('0.0275'));
        await matcher.settleOrders(
            swap.address,
            order,
            signature,
            interaction,
            ether('10'),
            0,
            ether('0.01'),
            matcher.address,
        );

        expect(await weth.balanceOf(addr.address)).to.equal(addrweth.sub(ether('0.0275')));
        assertRoughlyEqualValues(await weth.balanceOf(addr1.address), addr1weth.add(ether('0.0275')), 1e-4);
        // TODO: 3e-5 WETH lost into LimitOrderProtocol contract
        expect(await dai.balanceOf(addr.address)).to.equal(addrdai.add(ether('25')));
        expect(await dai.balanceOf(addr1.address)).to.equal(addr1dai.sub(ether('25')));
    });

    it('triple recursive swap', async function () {
        const { dai, weth, swap, matcher } = await loadFixture(initContracts);

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
            },
        );

        const signature1 = await signOrder(order1, chainId, swap.address, addr1);
        const signature2 = await signOrder(order2, chainId, swap.address, addr1);
        const signatureBackOrder = await signOrder(backOrder, chainId, swap.address, addr);

        const matchingParams =
            matcher.address +
            '01' +
            abiCoder
                .encode(
                    ['address[]', 'bytes[]'],
                    [
                        [weth.address, dai.address],
                        [
                            weth.interface.encodeFunctionData('approve', [swap.address, ether('0.0275')]),
                            dai.interface.encodeFunctionData('approve', [swap.address, ether('25')]),
                        ],
                    ],
                )
                .substring(2);

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
            swap.address,
            order1,
            signature1,
            externalInteraction,
            ether('10'),
            0,
            ether('0.01'),
            matcher.address,
        );

        expect(await weth.balanceOf(addr.address)).to.equal(addrweth.sub(ether('0.0275')));
        assertRoughlyEqualValues(await weth.balanceOf(addr1.address), addr1weth.add(ether('0.0275')), 1e-4);
        // TODO: 15e-6 WETH lost into LimitOrderProtocol contract
        expect(await dai.balanceOf(addr.address)).to.equal(addrdai.add(ether('25')));
        expect(await dai.balanceOf(addr1.address)).to.equal(addr1dai.sub(ether('25')));
    });

    describe('dutch auction params', function () {
        const prerareSingleOrder = async ({
            orderStartTime,
            initialStartRate = '1000',
            duration = '1800',
            salt = '1',
            dai,
            weth,
            swap,
            matcher,
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
                abiCoder
                    .encode(
                        ['address[]', 'bytes[]'],
                        [
                            [weth.address, weth.address, dai.address],
                            [
                                weth.interface.encodeFunctionData('transferFrom', [
                                    addr.address,
                                    matcher.address,
                                    actualTakingAmount,
                                ]),
                                weth.interface.encodeFunctionData('approve', [swap.address, actualTakingAmount]),
                                dai.interface.encodeFunctionData('transfer', [addr.address, makingAmount]),
                            ],
                        ],
                    )
                    .substring(2);

            await weth.approve(matcher.address, actualTakingAmount);
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
            const { dai, weth, swap, matcher } = await loadFixture(initContracts);

            const currentTimestamp = BigInt(await time.latest());
            const { order, signature, interaction, makingAmount, takingAmount } = await prerareSingleOrder({
                orderStartTime: currentTimestamp + BigInt(60),
                dai,
                weth,
                swap,
                matcher,
            });

            const addrweth = await weth.balanceOf(addr.address);
            const addr1weth = await weth.balanceOf(addr1.address);

            await matcher.settleOrders(
                swap.address,
                order,
                signature,
                interaction,
                makingAmount,
                0,
                takingAmount,
                matcher.address,
            );

            expect(await weth.balanceOf(addr1.address)).to.equal(addr1weth.add(ether('0.11')));
            expect(await weth.balanceOf(addr.address)).to.equal(addrweth.sub(ether('0.11')));
        });

        it('set initial rate', async function () {
            const { dai, weth, swap, matcher } = await loadFixture(initContracts);

            const currentTimestamp = BigInt(await time.latest());
            const { order, signature, interaction, makingAmount, takingAmount } = await prerareSingleOrder({
                orderStartTime: currentTimestamp,
                initialStartRate: '2000',
                dai,
                weth,
                swap,
                matcher,
            });

            const addrweth = await weth.balanceOf(addr.address);
            const addr1weth = await weth.balanceOf(addr1.address);
            await matcher.settleOrders(
                swap.address,
                order,
                signature,
                interaction,
                makingAmount,
                0,
                takingAmount,
                matcher.address,
            );

            expect(await weth.balanceOf(addr.address)).to.equal(addrweth.sub(ether('0.12')));
            assertRoughlyEqualValues(await weth.balanceOf(addr1.address), addr1weth.add(ether('0.12')), 1e-4);
        });

        it('set duration', async function () {
            const { dai, weth, swap, matcher } = await loadFixture(initContracts);

            const currentTimestamp = BigInt(await time.latest());
            const { order, signature, interaction, makingAmount, takingAmount } = await prerareSingleOrder({
                orderStartTime: currentTimestamp - BigInt(450),
                initialStartRate: '1000',
                duration: '900',
                dai,
                weth,
                swap,
                matcher,
            });

            const addrweth = await weth.balanceOf(addr.address);
            const addr1weth = await weth.balanceOf(addr1.address);
            await matcher.settleOrders(
                swap.address,
                order,
                signature,
                interaction,
                makingAmount,
                0,
                takingAmount,
                matcher.address,
            );

            expect(await weth.balanceOf(addr.address)).to.equal(addrweth.sub(ether('0.105')));
            assertRoughlyEqualValues(await weth.balanceOf(addr1.address), addr1weth.add(ether('0.105')), 1e-4);
        });
    });

    it('should change creditAllowance with non-zero fee', async function () {
        const { dai, weth, swap, matcher } = await loadFixture(initContracts);

        const orderFee = 100;
        const backOrderFee = 125;
        const order = await buildOrder({
            salt: buildSalt({ orderStartTime: await defaultExpiredAuctionTimestamp(), fee: orderFee }),
            makerAsset: dai.address,
            takerAsset: weth.address,
            makingAmount: ether('100'),
            takingAmount: ether('0.1'),
            from: addr.address,
        });
        const backOrder = await buildOrder({
            salt: buildSalt({ orderStartTime: await defaultExpiredAuctionTimestamp(), fee: backOrderFee }),
            makerAsset: weth.address,
            takerAsset: dai.address,
            makingAmount: ether('0.1'),
            takingAmount: ether('100'),
            from: addr1.address,
        });
        const signature = await signOrder(order, chainId, swap.address, addr);
        const signatureBackOrder = await signOrder(backOrder, chainId, swap.address, addr1);
        const matchingParams =
            matcher.address +
            '01' +
            abiCoder
                .encode(
                    ['address[]', 'bytes[]'],
                    [
                        [weth.address, dai.address],
                        [
                            weth.interface.encodeFunctionData('approve', [swap.address, ether('0.1')]),
                            dai.interface.encodeFunctionData('approve', [swap.address, ether('100')]),
                        ],
                    ],
                )
                .substring(2);
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
        const creditAllowanceBefore = await matcher.creditAllowance(addr.address);
        await matcher.settleOrdersEOA(
            swap.address,
            order,
            signature,
            interaction,
            ether('100'),
            0,
            ether('0.1'),
            matcher.address,
        );
        expect(await matcher.creditAllowance(addr.address)).to.equal(
            creditAllowanceBefore.sub(basePoints.mul(orderFee)).sub(basePoints.mul(backOrderFee)),
        );
    });

    it('should change creditAllowance with non-zero fee, msg.sender', async function () {
        const { dai, weth, swap, matcher } = await loadFixture(initContracts);

        const orderFee = 100;
        const backOrderFee = 125;
        const order = await buildOrder({
            salt: buildSalt({ orderStartTime: await defaultExpiredAuctionTimestamp(), fee: orderFee }),
            makerAsset: dai.address,
            takerAsset: weth.address,
            makingAmount: ether('100'),
            takingAmount: ether('0.1'),
            from: addr.address,
        });
        const backOrder = await buildOrder({
            salt: buildSalt({ orderStartTime: await defaultExpiredAuctionTimestamp(), fee: backOrderFee }),
            makerAsset: weth.address,
            takerAsset: dai.address,
            makingAmount: ether('0.1'),
            takingAmount: ether('100'),
            from: addr1.address,
        });
        const signature = await signOrder(order, chainId, swap.address, addr);
        const signatureBackOrder = await signOrder(backOrder, chainId, swap.address, addr1);
        const matchingParams =
            matcher.address +
            '01' +
            abiCoder
                .encode(
                    ['address[]', 'bytes[]'],
                    [
                        [weth.address, dai.address],
                        [
                            weth.interface.encodeFunctionData('approve', [swap.address, ether('0.1')]),
                            dai.interface.encodeFunctionData('approve', [swap.address, ether('100')]),
                        ],
                    ],
                )
                .substring(2);
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
        const creditAllowanceBefore = await matcher.creditAllowance(addr.address);
        await matcher.settleOrders(
            swap.address,
            order,
            signature,
            interaction,
            ether('100'),
            0,
            ether('0.1'),
            matcher.address,
        );
        expect(await matcher.creditAllowance(addr.address)).to.equal(
            creditAllowanceBefore.sub(basePoints.mul(orderFee)).sub(basePoints.mul(backOrderFee)),
        );
    });

    it('should change creditAllowance with non-zero fee, proxy contract, tx.origin', async function () {
        const { dai, weth, swap, matcher, proxy } = await loadFixture(initContracts);

        const orderFee = 100;
        const backOrderFee = 125;
        const order = await buildOrder({
            salt: buildSalt({ orderStartTime: await defaultExpiredAuctionTimestamp(), fee: orderFee }),
            makerAsset: dai.address,
            takerAsset: weth.address,
            makingAmount: ether('100'),
            takingAmount: ether('0.1'),
            from: addr.address,
        });
        const backOrder = await buildOrder({
            salt: buildSalt({ orderStartTime: await defaultExpiredAuctionTimestamp(), fee: backOrderFee }),
            makerAsset: weth.address,
            takerAsset: dai.address,
            makingAmount: ether('0.1'),
            takingAmount: ether('100'),
            from: addr1.address,
        });
        const signature = await signOrder(order, chainId, swap.address, addr);
        const signatureBackOrder = await signOrder(backOrder, chainId, swap.address, addr1);
        const matchingParams =
            matcher.address +
            '01' +
            abiCoder
                .encode(
                    ['address[]', 'bytes[]'],
                    [
                        [weth.address, dai.address],
                        [
                            weth.interface.encodeFunctionData('approve', [swap.address, ether('0.1')]),
                            dai.interface.encodeFunctionData('approve', [swap.address, ether('100')]),
                        ],
                    ],
                )
                .substring(2);
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
        const creditAllowanceBefore = await matcher.creditAllowance(addr.address);
        await proxy.settleOrdersEOA(
            swap.address,
            order,
            signature,
            interaction,
            ether('100'),
            0,
            ether('0.1'),
            matcher.address,
        );
        expect(await matcher.creditAllowance(addr.address)).to.equal(
            creditAllowanceBefore.sub(basePoints.mul(orderFee)).sub(basePoints.mul(backOrderFee)),
        );
    });

    it('should change creditAllowance with non-zero fee, proxy contract, msg.sender', async function () {
        const { dai, weth, swap, matcher, proxy } = await loadFixture(initContracts);

        const orderFee = 100;
        const backOrderFee = 125;
        const order = await buildOrder({
            salt: buildSalt({ orderStartTime: await defaultExpiredAuctionTimestamp(), fee: orderFee }),
            makerAsset: dai.address,
            takerAsset: weth.address,
            makingAmount: ether('100'),
            takingAmount: ether('0.1'),
            from: addr.address,
        });
        const backOrder = await buildOrder({
            salt: buildSalt({ orderStartTime: await defaultExpiredAuctionTimestamp(), fee: backOrderFee }),
            makerAsset: weth.address,
            takerAsset: dai.address,
            makingAmount: ether('0.1'),
            takingAmount: ether('100'),
            from: addr1.address,
        });
        const signature = await signOrder(order, chainId, swap.address, addr);
        const signatureBackOrder = await signOrder(backOrder, chainId, swap.address, addr1);
        const matchingParams =
            matcher.address +
            '01' +
            abiCoder
                .encode(
                    ['address[]', 'bytes[]'],
                    [
                        [weth.address, dai.address],
                        [
                            weth.interface.encodeFunctionData('approve', [swap.address, ether('0.1')]),
                            dai.interface.encodeFunctionData('approve', [swap.address, ether('100')]),
                        ],
                    ],
                )
                .substring(2);
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
        await whitelistRegistrySimple.setStatus(proxy.address, Status.Verified);
        await proxy.deposit(ether('100'));
        const creditAllowanceBefore = await matcher.creditAllowance(proxy.address);
        await proxy.settleOrders(
            swap.address,
            order,
            signature,
            interaction,
            ether('100'),
            0,
            ether('0.1'),
            matcher.address,
        );
        expect(await matcher.creditAllowance(proxy.address)).to.equal(
            creditAllowanceBefore.sub(basePoints.mul(orderFee)).sub(basePoints.mul(backOrderFee)),
        );
    });

    it('should not change when creditAllowance is not enough', async function () {
        const { dai, weth, swap, matcher } = await loadFixture(initContracts);

        const orderFee = ether('1000').toString();
        const backOrderFee = 125;
        const order = await buildOrder({
            salt: buildSalt({ orderStartTime: await defaultExpiredAuctionTimestamp(), fee: orderFee }),
            makerAsset: dai.address,
            takerAsset: weth.address,
            makingAmount: ether('100'),
            takingAmount: ether('0.1'),
            from: addr.address,
        });
        const backOrder = await buildOrder({
            salt: buildSalt({ orderStartTime: await defaultExpiredAuctionTimestamp(), fee: backOrderFee }),
            makerAsset: weth.address,
            takerAsset: dai.address,
            makingAmount: ether('0.1'),
            takingAmount: ether('100'),
            from: addr1.address,
        });
        const signature = await signOrder(order, chainId, swap.address, addr);
        const signatureBackOrder = await signOrder(backOrder, chainId, swap.address, addr1);
        const matchingParams =
            matcher.address +
            '01' +
            abiCoder
                .encode(
                    ['address[]', 'bytes[]'],
                    [
                        [weth.address, dai.address],
                        [
                            weth.interface.encodeFunctionData('approve', [swap.address, ether('0.1')]),
                            dai.interface.encodeFunctionData('approve', [swap.address, ether('100')]),
                        ],
                    ],
                )
                .substring(2);
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
            matcher.settleOrdersEOA(
                swap.address,
                order,
                signature,
                interaction,
                ether('100'),
                0,
                ether('0.1'),
                matcher.address,
            ),
        ).to.be.revertedWithCustomError(matcher, 'NotEnoughCredit');
    });

    describe('setFeeBank', function () {
        it('should change feeBank', async function () {
            const { matcher } = await loadFixture(initContracts);
            expect(await matcher.feeBank()).to.not.equal(addr1.address);
            await matcher.setFeeBank(addr1.address);
            expect(await matcher.feeBank()).to.equal(addr1.address);
        });
        it('should not change feeBank by non-owner', async function () {
            const { matcher } = await loadFixture(initContracts);
            await expect(matcher.connect(addr1).setFeeBank(addr1.address)).to.be.revertedWith(
                'Ownable: caller is not the owner',
            );
        });
    });

    describe('increaseCreditAllowance', function () {
        it('should increase credit', async function () {
            const { matcher } = await loadFixture(initContracts);
            const amount = ether('100');
            expect(await matcher.creditAllowance(addr1.address)).to.equal('0');
            await matcher.setFeeBank(addr.address);
            await matcher.increaseCreditAllowance(addr1.address, amount);
            expect(await matcher.creditAllowance(addr1.address)).to.equal(amount);
        });
        it('should not increase credit by non-feeBank address', async function () {
            const { matcher } = await loadFixture(initContracts);
            await expect(matcher.increaseCreditAllowance(addr1.address, ether('100'))).to.be.revertedWithCustomError(
                matcher,
                'OnlyFeeBankAccess',
            );
        });
    });

    describe('decreaseCreditAllowance', function () {
        async function initContractsAndAllowance() {
            const { matcher, feeBank } = await initContracts();
            const creditAmount = ether('100');
            await matcher.setFeeBank(addr.address);
            await matcher.increaseCreditAllowance(addr1.address, creditAmount);
            return { matcher, feeBank, creditAmount };
        }

        it('should decrease credit', async function () {
            const { matcher, creditAmount } = await loadFixture(initContractsAndAllowance);
            const amount = ether('10');
            expect(await matcher.creditAllowance(addr1.address)).to.equal(creditAmount);
            await matcher.decreaseCreditAllowance(addr1.address, amount);
            expect(await matcher.creditAllowance(addr1.address)).to.equal(creditAmount.sub(amount));
        });
        it('should not deccrease credit by non-feeBank address', async function () {
            const { matcher, feeBank } = await loadFixture(initContractsAndAllowance);
            await matcher.setFeeBank(feeBank.address);
            await expect(matcher.decreaseCreditAllowance(addr1.address, ether('10'))).to.be.revertedWithCustomError(
                matcher,
                'OnlyFeeBankAccess',
            );
        });
    });
});
