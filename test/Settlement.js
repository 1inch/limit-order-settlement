const { ether, assertRoughlyEqualValues, toBN, time } = require('@1inch/solidity-utils');
const { addr0Wallet, addr1Wallet } = require('./helpers/utils');

const TokenMock = artifacts.require('TokenMock');
const WrappedTokenMock = artifacts.require('WrappedTokenMock');
const LimitOrderProtocol = artifacts.require('LimitOrderProtocol');
const WhitelistRegistrySimple = artifacts.require('WhitelistRegistrySimple');
const Settlement = artifacts.require('Settlement');
const FeeBank = artifacts.require('FeeBank');
const ProxySettlement = artifacts.require('ProxySettlement');

const { buildOrder, signOrder, buildSalt, defaultExpiredAuctionTimestamp } = require('./helpers/orderUtils');

const Status = Object.freeze({
    Unverified: toBN('0'),
    Verified: toBN('1'),
});

describe('Settlement', async () => {
    const [addr0, addr1] = [addr0Wallet.getAddressString(), addr1Wallet.getAddressString()];
    const basePoints = ether('0.001'); // 1e15

    before(async () => {
        this.chainId = await web3.eth.getChainId();
        this.whitelistRegistrySimple = await WhitelistRegistrySimple.new();
        await this.whitelistRegistrySimple.setStatus(addr0, Status.Verified);
        await this.whitelistRegistrySimple.setStatus(addr1, Status.Verified);
    });

    beforeEach(async () => {
        this.dai = await TokenMock.new('DAI', 'DAI');
        this.weth = await WrappedTokenMock.new('WETH', 'WETH');
        this.inch = await TokenMock.new('1INCH', '1INCH');

        this.swap = await LimitOrderProtocol.new(this.weth.address);

        await this.dai.mint(addr0, ether('100'));
        await this.dai.mint(addr1, ether('100'));
        await this.inch.mint(addr0, ether('100'));
        await this.weth.deposit({ from: addr0, value: ether('1') });
        await this.weth.deposit({ from: addr1, value: ether('1') });

        await this.dai.approve(this.swap.address, ether('100'));
        await this.dai.approve(this.swap.address, ether('100'), {
            from: addr1,
        });
        await this.weth.approve(this.swap.address, ether('1'));
        await this.weth.approve(this.swap.address, ether('1'), { from: addr1 });

        this.matcher = await Settlement.new(this.whitelistRegistrySimple.address, this.swap.address);
        this.feeBank = await FeeBank.new(this.matcher.address, this.inch.address);
        await this.matcher.setFeeBank(this.feeBank.address);
        await this.inch.approve(this.feeBank.address, ether('100'));
        await this.feeBank.deposit(ether('100'));

        this.proxy = await ProxySettlement.new(this.matcher.address, this.inch.address, this.feeBank.address);
        await this.inch.mint(this.proxy.address, ether('100'));
    });

    it('opposite direction recursive swap', async () => {
        const order = await buildOrder(
            {
                makerAsset: this.dai.address,
                takerAsset: this.weth.address,
                makingAmount: ether('100'),
                takingAmount: ether('0.1'),
                salt: buildSalt({ orderStartTime: await time.latest() }),
                from: addr0,
            },
            {
                predicate: this.swap.contract.methods.timestampBelow(0xff00000000).encodeABI(),
            },
        );

        const backOrder = await buildOrder(
            {
                makerAsset: this.weth.address,
                takerAsset: this.dai.address,
                makingAmount: ether('0.11'),
                takingAmount: ether('100'),
                from: addr1,
            },
            {
                predicate: this.swap.contract.methods.timestampBelow(0xff00000000).encodeABI(),
            },
        );

        const signature = signOrder(order, this.chainId, this.swap.address, addr0Wallet.getPrivateKey());
        const signatureBackOrder = signOrder(backOrder, this.chainId, this.swap.address, addr1Wallet.getPrivateKey());

        const matchingParams =
            this.matcher.address +
            '01' +
            web3.eth.abi
                .encodeParameters(
                    ['address[]', 'bytes[]'],
                    [
                        [this.weth.address, this.dai.address],
                        [
                            this.weth.contract.methods.approve(this.swap.address, ether('0.11')).encodeABI(),
                            this.dai.contract.methods.approve(this.swap.address, ether('100.00')).encodeABI(),
                        ],
                    ],
                )
                .substring(2);

        const interaction =
            this.matcher.address +
            '00' +
            this.swap.contract.methods
                .fillOrderTo(backOrder, signatureBackOrder, matchingParams, ether('0.11'), 0, ether('100'), this.matcher.address)
                .encodeABI()
                .substring(10);

        const addr0weth = await this.weth.balanceOf(addr0);
        const addr1weth = await this.weth.balanceOf(addr1);
        const addr0dai = await this.dai.balanceOf(addr0);
        const addr1dai = await this.dai.balanceOf(addr1);

        await this.matcher.matchOrders(
            this.swap.address,
            order,
            signature,
            interaction,
            ether('100'),
            0,
            ether('0.11'),
            this.matcher.address,
        );

        assertRoughlyEqualValues(await this.weth.balanceOf(addr0), addr0weth.add(ether('0.11')), 1e-4);
        // TODO: 6e-5 WETH lost into LimitOrderProtocol contract
        expect(await this.weth.balanceOf(addr1)).to.be.bignumber.equal(addr1weth.sub(ether('0.11')));
        expect(await this.dai.balanceOf(addr0)).to.be.bignumber.equal(addr0dai.sub(ether('100')));
        expect(await this.dai.balanceOf(addr1)).to.be.bignumber.equal(addr1dai.add(ether('100')));
    });

    it('unidirectional recursive swap', async () => {
        const order = await buildOrder(
            {
                makerAsset: this.dai.address,
                takerAsset: this.weth.address,
                makingAmount: ether('10'),
                takingAmount: ether('0.01'),
                salt: buildSalt({ orderStartTime: await time.latest() }),
                from: addr1,
            },
            {
                predicate: this.swap.contract.methods.timestampBelow(0xff00000000).encodeABI(),
            },
        );

        const backOrder = await buildOrder(
            {
                makerAsset: this.dai.address,
                takerAsset: this.weth.address,
                makingAmount: ether('15'),
                takingAmount: ether('0.015'),
                salt: buildSalt({ orderStartTime: await time.latest() }),
                from: addr1,
            },
            {
                predicate: this.swap.contract.methods.timestampBelow(0xff00000000).encodeABI(),
            },
        );

        const signature = signOrder(order, this.chainId, this.swap.address, addr1Wallet.getPrivateKey());
        const signatureBackOrder = signOrder(backOrder, this.chainId, this.swap.address, addr1Wallet.getPrivateKey());

        const matchingParams =
            this.matcher.address +
            '01' +
            web3.eth.abi
                .encodeParameters(
                    ['address[]', 'bytes[]'],
                    [
                        [this.weth.address, this.weth.address, this.dai.address],
                        [
                            this.weth.contract.methods
                                .transferFrom(addr0, this.matcher.address, ether('0.0275'))
                                .encodeABI(),
                            this.weth.contract.methods.approve(this.swap.address, ether('0.0275')).encodeABI(),
                            this.dai.contract.methods.transfer(addr0, ether('25')).encodeABI(),
                        ],
                    ],
                )
                .substring(2);

        const interaction =
            this.matcher.address +
            '00' +
            this.swap.contract.methods
                .fillOrderTo(backOrder, signatureBackOrder, matchingParams, ether('15'), 0, ether('0.015'), this.matcher.address)
                .encodeABI()
                .substring(10);

        const addr0weth = await this.weth.balanceOf(addr0);
        const addr1weth = await this.weth.balanceOf(addr1);
        const addr0dai = await this.dai.balanceOf(addr0);
        const addr1dai = await this.dai.balanceOf(addr1);

        await this.weth.approve(this.matcher.address, ether('0.0275'));
        await this.matcher.matchOrders(this.swap.address, order, signature, interaction, ether('10'), 0, ether('0.01'), this.matcher.address);

        expect(await this.weth.balanceOf(addr0)).to.be.bignumber.equal(addr0weth.sub(ether('0.0275')));
        assertRoughlyEqualValues(await this.weth.balanceOf(addr1), addr1weth.add(ether('0.0275')), 1e-4);
        // TODO: 3e-5 WETH lost into LimitOrderProtocol contract
        expect(await this.dai.balanceOf(addr0)).to.be.bignumber.equal(addr0dai.add(ether('25')));
        expect(await this.dai.balanceOf(addr1)).to.be.bignumber.equal(addr1dai.sub(ether('25')));
    });

    it('triple recursive swap', async () => {
        const order1 = await buildOrder(
            {
                makerAsset: this.dai.address,
                takerAsset: this.weth.address,
                makingAmount: ether('10'),
                takingAmount: ether('0.01'),
                salt: buildSalt({ orderStartTime: await time.latest() }),
                from: addr1,
            },
            {
                predicate: this.swap.contract.methods.timestampBelow(0xff00000000).encodeABI(),
            },
        );

        const order2 = await buildOrder(
            {
                makerAsset: this.dai.address,
                takerAsset: this.weth.address,
                makingAmount: ether('15'),
                takingAmount: ether('0.015'),
                salt: buildSalt({ orderStartTime: await time.latest() }),
                from: addr1,
            },
            {
                predicate: this.swap.contract.methods.timestampBelow(0xff00000000).encodeABI(),
            },
        );

        const backOrder = await buildOrder(
            {
                makerAsset: this.weth.address,
                takerAsset: this.dai.address,
                makingAmount: ether('0.0275'),
                takingAmount: ether('25'),
                from: addr0,
            },
            {
                predicate: this.swap.contract.methods.timestampBelow(0xff00000000).encodeABI(),
            },
        );

        const signature1 = signOrder(order1, this.chainId, this.swap.address, addr1Wallet.getPrivateKey());
        const signature2 = signOrder(order2, this.chainId, this.swap.address, addr1Wallet.getPrivateKey());
        const signatureBackOrder = signOrder(backOrder, this.chainId, this.swap.address, addr0Wallet.getPrivateKey());

        const matchingParams =
            this.matcher.address +
            '01' +
            web3.eth.abi
                .encodeParameters(
                    ['address[]', 'bytes[]'],
                    [
                        [this.weth.address, this.dai.address],
                        [
                            this.weth.contract.methods.approve(this.swap.address, ether('0.0275')).encodeABI(),
                            this.dai.contract.methods.approve(this.swap.address, ether('25')).encodeABI(),
                        ],
                    ],
                )
                .substring(2);

        const internalInteraction =
            this.matcher.address +
            '00' +
            this.swap.contract.methods
                .fillOrderTo(backOrder, signatureBackOrder, matchingParams, ether('0.0275'), 0, ether('25'), this.matcher.address)
                .encodeABI()
                .substring(10);

        const externalInteraction =
            this.matcher.address +
            '00' +
            this.swap.contract.methods
                .fillOrderTo(order2, signature2, internalInteraction, ether('15'), 0, ether('0.015'), this.matcher.address)
                .encodeABI()
                .substring(10);

        const addr0weth = await this.weth.balanceOf(addr0);
        const addr1weth = await this.weth.balanceOf(addr1);
        const addr0dai = await this.dai.balanceOf(addr0);
        const addr1dai = await this.dai.balanceOf(addr1);

        await this.matcher.matchOrders(
            this.swap.address,
            order1,
            signature1,
            externalInteraction,
            ether('10'),
            0,
            ether('0.01'),
            this.matcher.address,
        );

        expect(await this.weth.balanceOf(addr0)).to.be.bignumber.equal(addr0weth.sub(ether('0.0275')));
        assertRoughlyEqualValues(await this.weth.balanceOf(addr1), addr1weth.add(ether('0.0275')), 1e-4);
        // TODO: 15e-6 WETH lost into LimitOrderProtocol contract
        expect(await this.dai.balanceOf(addr0)).to.be.bignumber.equal(addr0dai.add(ether('25')));
        expect(await this.dai.balanceOf(addr1)).to.be.bignumber.equal(addr1dai.sub(ether('25')));
    });

    describe('dutch auction params', async () => {
        const prerareSingleOrder = async (orderStartTime, initialStartRate = '1000', duration = '1800', salt = '1') => {
            const makerAsset = this.dai.address;
            const takerAsset = this.weth.address;
            const makingAmount = ether('100');
            const takingAmount = ether('0.1');
            const order = await buildOrder(
                {
                    salt: buildSalt({ orderStartTime, initialStartRate, duration, salt }),
                    makerAsset,
                    takerAsset,
                    makingAmount,
                    takingAmount,
                    from: addr1,
                },
                {
                    predicate: this.swap.contract.methods.timestampBelow(0xff00000000).encodeABI(),
                },
            );

            const signature = signOrder(order, this.chainId, this.swap.address, addr1Wallet.getPrivateKey());

            let actualTakingAmount = takingAmount;
            const ts = await time.latest();
            if (ts.lt(orderStartTime.add(toBN(duration)))) {
                // actualTakingAmount = actualTakingAmount * (
                //    _BASE_POINTS + initialStartRate * (orderTime + duration - currentTimestamp) / duration
                // ) / _BASE_POINTS
                actualTakingAmount = actualTakingAmount
                    .mul(
                        toBN('10000').add(
                            toBN(initialStartRate)
                                .mul(toBN(orderStartTime).add(toBN(duration)).sub(ts))
                                .div(toBN(duration)),
                        ),
                    )
                    .div(toBN('10000'));
            }

            const matchingParams =
                this.matcher.address +
                '01' +
                web3.eth.abi
                    .encodeParameters(
                        ['address[]', 'bytes[]'],
                        [
                            [this.weth.address, this.weth.address, this.dai.address],
                            [
                                this.weth.contract.methods
                                    .transferFrom(addr0, this.matcher.address, actualTakingAmount)
                                    .encodeABI(),
                                this.weth.contract.methods.approve(this.swap.address, actualTakingAmount).encodeABI(),
                                this.dai.contract.methods.transfer(addr0, makingAmount).encodeABI(),
                            ],
                        ],
                    )
                    .substring(2);

            await this.weth.approve(this.matcher.address, actualTakingAmount);
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

        it("can't match order before orderTime", async () => {
            const currentTimestamp = await time.latest();
            const { order, signature, interaction, makingAmount, takingAmount } = await prerareSingleOrder(
                currentTimestamp.addn(60),
            );

            await expect(
                this.matcher.matchOrders(
                    this.swap.address,
                    order,
                    signature,
                    interaction,
                    makingAmount,
                    0,
                    takingAmount,
                    this.matcher.address,
                ),
            ).to.be.rejectedWith('IncorrectOrderStartTime()');
        });

        it('set initial rate', async () => {
            const currentTimestamp = await time.latest();
            const { order, signature, interaction, makingAmount, takingAmount } = await prerareSingleOrder(
                currentTimestamp,
                '2000',
            );

            const addr0weth = await this.weth.balanceOf(addr0);
            const addr1weth = await this.weth.balanceOf(addr1);
            await this.matcher.matchOrders(
                this.swap.address,
                order,
                signature,
                interaction,
                makingAmount,
                0,
                takingAmount,
                this.matcher.address,
            );

            expect(await this.weth.balanceOf(addr0)).to.be.bignumber.equal(addr0weth.sub(ether('0.12')));
            assertRoughlyEqualValues(await this.weth.balanceOf(addr1), addr1weth.add(ether('0.12')), 1e-4);
        });

        it('set duration', async () => {
            const currentTimestamp = await time.latest();
            const { order, signature, interaction, makingAmount, takingAmount } = await prerareSingleOrder(
                currentTimestamp.subn(450),
                '1000',
                '900',
            );

            const addr0weth = await this.weth.balanceOf(addr0);
            const addr1weth = await this.weth.balanceOf(addr1);
            await this.matcher.matchOrders(
                this.swap.address,
                order,
                signature,
                interaction,
                makingAmount,
                0,
                takingAmount,
                this.matcher.address,
            );

            expect(await this.weth.balanceOf(addr0)).to.be.bignumber.equal(addr0weth.sub(ether('0.105')));
            assertRoughlyEqualValues(await this.weth.balanceOf(addr1), addr1weth.add(ether('0.105')), 1e-4);
        });
    });

    it('should change creditAllowance with non-zero fee', async () => {
        const orderFee = 100;
        const backOrderFee = 125;
        const order = await buildOrder({
            salt: buildSalt({ orderStartTime: await defaultExpiredAuctionTimestamp(), fee: orderFee }),
            makerAsset: this.dai.address,
            takerAsset: this.weth.address,
            makingAmount: ether('100'),
            takingAmount: ether('0.1'),
            from: addr0,
        });
        const backOrder = await buildOrder({
            salt: buildSalt({ orderStartTime: await defaultExpiredAuctionTimestamp(), fee: backOrderFee }),
            makerAsset: this.weth.address,
            takerAsset: this.dai.address,
            makingAmount: ether('0.1'),
            takingAmount: ether('100'),
            from: addr1,
        });
        const signature = signOrder(order, this.chainId, this.swap.address, addr0Wallet.getPrivateKey());
        const signatureBackOrder = signOrder(backOrder, this.chainId, this.swap.address, addr1Wallet.getPrivateKey());
        const matchingParams =
            this.matcher.address +
            '01' +
            web3.eth.abi
                .encodeParameters(
                    ['address[]', 'bytes[]'],
                    [
                        [this.weth.address, this.dai.address],
                        [
                            this.weth.contract.methods.approve(this.swap.address, ether('0.1')).encodeABI(),
                            this.dai.contract.methods.approve(this.swap.address, ether('100')).encodeABI(),
                        ],
                    ],
                )
                .substring(2);
        const interaction =
            this.matcher.address +
            '00' +
            this.swap.contract.methods
                .fillOrderTo(backOrder, signatureBackOrder, matchingParams, ether('0.1'), 0, ether('100'), this.matcher.address)
                .encodeABI()
                .substring(10);
        const creditAllowanceBefore = await this.matcher.creditAllowance(addr0);
        await this.matcher.matchOrdersEOA(
            this.swap.address,
            order,
            signature,
            interaction,
            ether('100'),
            0,
            ether('0.1'),
            this.matcher.address,
        );
        expect(await this.matcher.creditAllowance(addr0)).to.be.bignumber.eq(
            creditAllowanceBefore.sub(basePoints.muln(orderFee)).sub(basePoints.muln(backOrderFee)),
        );
    });

    it('should change creditAllowance with non-zero fee, msg.sender', async () => {
        const orderFee = 100;
        const backOrderFee = 125;
        const order = await buildOrder({
            salt: buildSalt({ orderStartTime: await defaultExpiredAuctionTimestamp(), fee: orderFee }),
            makerAsset: this.dai.address,
            takerAsset: this.weth.address,
            makingAmount: ether('100'),
            takingAmount: ether('0.1'),
            from: addr0,
        });
        const backOrder = await buildOrder({
            salt: buildSalt({ orderStartTime: await defaultExpiredAuctionTimestamp(), fee: backOrderFee }),
            makerAsset: this.weth.address,
            takerAsset: this.dai.address,
            makingAmount: ether('0.1'),
            takingAmount: ether('100'),
            from: addr1,
        });
        const signature = signOrder(order, this.chainId, this.swap.address, addr0Wallet.getPrivateKey());
        const signatureBackOrder = signOrder(backOrder, this.chainId, this.swap.address, addr1Wallet.getPrivateKey());
        const matchingParams =
            this.matcher.address +
            '01' +
            web3.eth.abi
                .encodeParameters(
                    ['address[]', 'bytes[]'],
                    [
                        [this.weth.address, this.dai.address],
                        [
                            this.weth.contract.methods.approve(this.swap.address, ether('0.1')).encodeABI(),
                            this.dai.contract.methods.approve(this.swap.address, ether('100')).encodeABI(),
                        ],
                    ],
                )
                .substring(2);
        const interaction =
            this.matcher.address +
            '00' +
            this.swap.contract.methods
                .fillOrderTo(backOrder, signatureBackOrder, matchingParams, ether('0.1'), 0, ether('100'), this.matcher.address)
                .encodeABI()
                .substring(10);
        const creditAllowanceBefore = await this.matcher.creditAllowance(addr0);
        await this.matcher.matchOrders(this.swap.address, order, signature, interaction, ether('100'), 0, ether('0.1'), this.matcher.address);
        expect(await this.matcher.creditAllowance(addr0)).to.be.bignumber.eq(
            creditAllowanceBefore.sub(basePoints.muln(orderFee)).sub(basePoints.muln(backOrderFee)),
        );
    });

    it('should change creditAllowance with non-zero fee, proxy contract, tx.origin', async () => {
        const orderFee = 100;
        const backOrderFee = 125;
        const order = await buildOrder({
            salt: buildSalt({ orderStartTime: await defaultExpiredAuctionTimestamp(), fee: orderFee }),
            makerAsset: this.dai.address,
            takerAsset: this.weth.address,
            makingAmount: ether('100'),
            takingAmount: ether('0.1'),
            from: addr0,
        });
        const backOrder = await buildOrder({
            salt: buildSalt({ orderStartTime: await defaultExpiredAuctionTimestamp(), fee: backOrderFee }),
            makerAsset: this.weth.address,
            takerAsset: this.dai.address,
            makingAmount: ether('0.1'),
            takingAmount: ether('100'),
            from: addr1,
        });
        const signature = signOrder(order, this.chainId, this.swap.address, addr0Wallet.getPrivateKey());
        const signatureBackOrder = signOrder(backOrder, this.chainId, this.swap.address, addr1Wallet.getPrivateKey());
        const matchingParams =
            this.matcher.address +
            '01' +
            web3.eth.abi
                .encodeParameters(
                    ['address[]', 'bytes[]'],
                    [
                        [this.weth.address, this.dai.address],
                        [
                            this.weth.contract.methods.approve(this.swap.address, ether('0.1')).encodeABI(),
                            this.dai.contract.methods.approve(this.swap.address, ether('100')).encodeABI(),
                        ],
                    ],
                )
                .substring(2);
        const interaction =
            this.matcher.address +
            '00' +
            this.swap.contract.methods
                .fillOrderTo(backOrder, signatureBackOrder, matchingParams, ether('0.1'), 0, ether('100'), this.matcher.address)
                .encodeABI()
                .substring(10);
        const creditAllowanceBefore = await this.matcher.creditAllowance(addr0);
        await this.proxy.matchOrdersEOA(
            this.swap.address,
            order,
            signature,
            interaction,
            ether('100'),
            0,
            ether('0.1'),
            this.matcher.address,
        );
        expect(await this.matcher.creditAllowance(addr0)).to.be.bignumber.eq(
            creditAllowanceBefore.sub(basePoints.muln(orderFee)).sub(basePoints.muln(backOrderFee)),
        );
    });

    it('should change creditAllowance with non-zero fee, proxy contract, msg.sender', async () => {
        const orderFee = 100;
        const backOrderFee = 125;
        const order = await buildOrder({
            salt: buildSalt({ orderStartTime: await defaultExpiredAuctionTimestamp(), fee: orderFee }),
            makerAsset: this.dai.address,
            takerAsset: this.weth.address,
            makingAmount: ether('100'),
            takingAmount: ether('0.1'),
            from: addr0,
        });
        const backOrder = await buildOrder({
            salt: buildSalt({ orderStartTime: await defaultExpiredAuctionTimestamp(), fee: backOrderFee }),
            makerAsset: this.weth.address,
            takerAsset: this.dai.address,
            makingAmount: ether('0.1'),
            takingAmount: ether('100'),
            from: addr1,
        });
        const signature = signOrder(order, this.chainId, this.swap.address, addr0Wallet.getPrivateKey());
        const signatureBackOrder = signOrder(backOrder, this.chainId, this.swap.address, addr1Wallet.getPrivateKey());
        const matchingParams =
            this.matcher.address +
            '01' +
            web3.eth.abi
                .encodeParameters(
                    ['address[]', 'bytes[]'],
                    [
                        [this.weth.address, this.dai.address],
                        [
                            this.weth.contract.methods.approve(this.swap.address, ether('0.1')).encodeABI(),
                            this.dai.contract.methods.approve(this.swap.address, ether('100')).encodeABI(),
                        ],
                    ],
                )
                .substring(2);
        const interaction =
            this.matcher.address +
            '00' +
            this.swap.contract.methods
                .fillOrderTo(backOrder, signatureBackOrder, matchingParams, ether('0.1'), 0, ether('100'), this.matcher.address)
                .encodeABI()
                .substring(10);
        await this.whitelistRegistrySimple.setStatus(this.proxy.address, Status.Verified);
        await this.proxy.deposit(ether('100'));
        const creditAllowanceBefore = await this.matcher.creditAllowance(this.proxy.address);
        await this.proxy.matchOrders(this.swap.address, order, signature, interaction, ether('100'), 0, ether('0.1'), this.matcher.address);
        expect(await this.matcher.creditAllowance(this.proxy.address)).to.be.bignumber.eq(
            creditAllowanceBefore.sub(basePoints.muln(orderFee)).sub(basePoints.muln(backOrderFee)),
        );
    });

    it('should not change when creditAllowance is not enough', async () => {
        const orderFee = ether('1000').toString();
        const backOrderFee = 125;
        const order = await buildOrder({
            salt: buildSalt({ orderStartTime: await defaultExpiredAuctionTimestamp(), fee: orderFee }),
            makerAsset: this.dai.address,
            takerAsset: this.weth.address,
            makingAmount: ether('100'),
            takingAmount: ether('0.1'),
            from: addr0,
        });
        const backOrder = await buildOrder({
            salt: buildSalt({ orderStartTime: await defaultExpiredAuctionTimestamp(), fee: backOrderFee }),
            makerAsset: this.weth.address,
            takerAsset: this.dai.address,
            makingAmount: ether('0.1'),
            takingAmount: ether('100'),
            from: addr1,
        });
        const signature = signOrder(order, this.chainId, this.swap.address, addr0Wallet.getPrivateKey());
        const signatureBackOrder = signOrder(backOrder, this.chainId, this.swap.address, addr1Wallet.getPrivateKey());
        const matchingParams =
            this.matcher.address +
            '01' +
            web3.eth.abi
                .encodeParameters(
                    ['address[]', 'bytes[]'],
                    [
                        [this.weth.address, this.dai.address],
                        [
                            this.weth.contract.methods.approve(this.swap.address, ether('0.1')).encodeABI(),
                            this.dai.contract.methods.approve(this.swap.address, ether('100')).encodeABI(),
                        ],
                    ],
                )
                .substring(2);
        const interaction =
            this.matcher.address +
            '00' +
            this.swap.contract.methods
                .fillOrderTo(backOrder, signatureBackOrder, matchingParams, ether('0.1'), 0, ether('100'), this.matcher.address)
                .encodeABI()
                .substring(10);
        await expect(
            this.matcher.matchOrdersEOA(
                this.swap.address,
                order,
                signature,
                interaction,
                ether('100'),
                0,
                ether('0.1'),
                this.matcher.address,
            ),
        ).to.eventually.be.rejectedWith('NotEnoughCredit()');
    });

    describe('setFeeBank', async () => {
        it('should change feeBank', async () => {
            expect(await this.matcher.feeBank()).to.be.not.equals(addr1);
            await this.matcher.setFeeBank(addr1);
            expect((await this.matcher.feeBank()).toLowerCase()).to.be.equals(addr1.toLowerCase());
        });
        it('should not change feeBank by non-owner', async () => {
            await expect(this.matcher.setFeeBank(addr1, { from: addr1 })).to.eventually.be.rejectedWith(
                'Ownable: caller is not the owner',
            );
        });
    });

    describe('increaseCreditAllowance', async () => {
        it('should increase credit', async () => {
            const amount = ether('100');
            expect(await this.matcher.creditAllowance(addr1)).to.be.bignumber.eq('0');
            await this.matcher.setFeeBank(addr0);
            await this.matcher.increaseCreditAllowance(addr1, amount);
            expect(await this.matcher.creditAllowance(addr1)).to.be.bignumber.eq(amount);
        });
        it('should not increase credit by non-feeBank address', async () => {
            await expect(this.matcher.increaseCreditAllowance(addr1, ether('100'))).to.eventually.be.rejectedWith(
                'OnlyFeeBankAccess()',
            );
        });
    });

    describe('decreaseCreditAllowance', async () => {
        beforeEach(async () => {
            this.creditAmount = ether('100');
            await this.matcher.setFeeBank(addr0);
            await this.matcher.increaseCreditAllowance(addr1, this.creditAmount);
        });
        it('should decrease credit', async () => {
            const amount = ether('10');
            expect(await this.matcher.creditAllowance(addr1)).to.be.bignumber.eq(this.creditAmount);
            await this.matcher.decreaseCreditAllowance(addr1, amount);
            expect(await this.matcher.creditAllowance(addr1)).to.be.bignumber.eq(this.creditAmount.sub(amount));
        });
        it('should not deccrease credit by non-feeBank address', async () => {
            await this.matcher.setFeeBank(this.feeBank.address);
            await expect(this.matcher.decreaseCreditAllowance(addr1, ether('10'))).to.eventually.be.rejectedWith(
                'OnlyFeeBankAccess()',
            );
        });
    });
});
