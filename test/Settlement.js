const { time, expectRevert } = require('@openzeppelin/test-helpers');
const { ether, assertRoughlyEqualValues } = require('@1inch/solidity-utils');
const { addr0Wallet, addr1Wallet } = require('./helpers/utils');

const TokenMock = artifacts.require('TokenMock');
const WrappedTokenMock = artifacts.require('WrappedTokenMock');
const LimitOrderProtocol = artifacts.require('LimitOrderProtocol');
const Settlement = artifacts.require('Settlement');
const MockFeeCollector = artifacts.require('MockFeeCollector');

const { buildOrder, signOrder, buildSalt } = require('./helpers/orderUtils');
const { toBN } = require('web3-utils');
const { expect } = require('chai');

describe('Settlement', async () => {
    const [addr0, addr1] = [addr0Wallet.getAddressString(), addr1Wallet.getAddressString()];

    before(async () => {
        this.chainId = await web3.eth.getChainId();
    });

    beforeEach(async () => {
        this.dai = await TokenMock.new('DAI', 'DAI');
        this.weth = await WrappedTokenMock.new('WETH', 'WETH');

        this.swap = await LimitOrderProtocol.new(this.weth.address);

        await this.dai.mint(addr0, ether('100'));
        await this.dai.mint(addr1, ether('100'));
        await this.weth.deposit({ from: addr0, value: ether('1') });
        await this.weth.deposit({ from: addr1, value: ether('1') });

        await this.dai.approve(this.swap.address, ether('100'));
        await this.dai.approve(this.swap.address, ether('100'), { from: addr1 });
        await this.weth.approve(this.swap.address, ether('1'));
        await this.weth.approve(this.swap.address, ether('1'), { from: addr1 });

        this.feeCollector = await MockFeeCollector.new();
        this.matcher = await Settlement.new(this.feeCollector.address);
    });

    it('opposite direction recursive swap', async () => {
        const order = buildOrder(
            {
                makerAsset: this.dai.address,
                takerAsset: this.weth.address,
                makingAmount: ether('100'),
                takingAmount: ether('0.1'),
                salt: buildSalt(await time.latest()),
                from: addr0,
            },
            {
                predicate: this.swap.contract.methods.timestampBelow(0xff00000000).encodeABI(),
            },
        );

        const backOrder = buildOrder(
            {
                makerAsset: this.weth.address,
                takerAsset: this.dai.address,
                makingAmount: ether('0.1'),
                takingAmount: ether('100'),
                salt: buildSalt(await time.latest()),
                from: addr1,
            },
            {
                predicate: this.swap.contract.methods.timestampBelow(0xff00000000).encodeABI(),
            },
        );

        const signature = signOrder(order, this.chainId, this.swap.address, addr0Wallet.getPrivateKey());
        const signatureBackOrder = signOrder(backOrder, this.chainId, this.swap.address, addr1Wallet.getPrivateKey());

        const matchingParams = this.matcher.address + '01' + web3.eth.abi.encodeParameters(
            ['address[]', 'bytes[]'],
            [
                [
                    this.weth.address,
                    this.dai.address,
                ],
                [
                    this.weth.contract.methods.approve(this.swap.address, ether('0.1')).encodeABI(),
                    this.dai.contract.methods.approve(this.swap.address, ether('100')).encodeABI(),
                ],
            ],
        ).substring(2);

        const interaction = this.matcher.address + '00' + this.swap.contract.methods.fillOrder(
            backOrder,
            signatureBackOrder,
            matchingParams,
            ether('0.1'),
            0,
            ether('100'),
        ).encodeABI().substring(10);

        const addr0weth = await this.weth.balanceOf(addr0);
        const addr1weth = await this.weth.balanceOf(addr1);
        const addr0dai = await this.dai.balanceOf(addr0);
        const addr1dai = await this.dai.balanceOf(addr1);

        await this.matcher.matchOrders(this.swap.address, order, signature, interaction, ether('100'), 0, ether('0.1'));

        expect(await this.weth.balanceOf(addr0)).to.be.bignumber.equal(addr0weth.add(ether('0.1')));
        expect(await this.weth.balanceOf(addr1)).to.be.bignumber.equal(addr1weth.sub(ether('0.1')));
        expect(await this.dai.balanceOf(addr0)).to.be.bignumber.equal(addr0dai.sub(ether('100')));
        expect(await this.dai.balanceOf(addr1)).to.be.bignumber.equal(addr1dai.add(ether('100')));
    });

    it('unidirectional recursive swap', async () => {
        const order = buildOrder(
            {
                makerAsset: this.dai.address,
                takerAsset: this.weth.address,
                makingAmount: ether('10'),
                takingAmount: ether('0.01'),
                salt: buildSalt(await time.latest()),
                from: addr1,
            },
            {
                predicate: this.swap.contract.methods.timestampBelow(0xff00000000).encodeABI(),
            },
        );

        const backOrder = buildOrder(
            {
                makerAsset: this.dai.address,
                takerAsset: this.weth.address,
                makingAmount: ether('15'),
                takingAmount: ether('0.015'),
                salt: buildSalt(await time.latest()),
                from: addr1,
            },
            {
                predicate: this.swap.contract.methods.timestampBelow(0xff00000000).encodeABI(),
            },
        );

        const signature = signOrder(order, this.chainId, this.swap.address, addr1Wallet.getPrivateKey());
        const signatureBackOrder = signOrder(backOrder, this.chainId, this.swap.address, addr1Wallet.getPrivateKey());

        const matchingParams = this.matcher.address + '01' + web3.eth.abi.encodeParameters(
            ['address[]', 'bytes[]'],
            [
                [
                    this.weth.address,
                    this.weth.address,
                    this.dai.address,
                ],
                [
                    this.weth.contract.methods.transferFrom(addr0, this.matcher.address, ether('0.025')).encodeABI(),
                    this.dai.contract.methods.approve(this.swap.address, ether('0.025')).encodeABI(),
                    this.weth.contract.methods.transfer(addr0, ether('25')).encodeABI(),
                ],
            ],
        ).substring(2);

        const interaction = this.matcher.address + '00' + this.swap.contract.methods.fillOrder(
            backOrder,
            signatureBackOrder,
            matchingParams,
            ether('15'),
            0,
            ether('0.015'),
        ).encodeABI().substring(10);

        const addr0weth = await this.weth.balanceOf(addr0);
        const addr1weth = await this.weth.balanceOf(addr1);
        const addr0dai = await this.dai.balanceOf(addr0);
        const addr1dai = await this.dai.balanceOf(addr1);

        await this.weth.approve(this.matcher.address, ether('0.025'));
        await this.matcher.matchOrders(this.swap.address, order, signature, interaction, ether('10'), 0, ether('0.01'));

        expect(await this.weth.balanceOf(addr0)).to.be.bignumber.equal(addr0weth.sub(ether('0.025')));
        expect(await this.weth.balanceOf(addr1)).to.be.bignumber.equal(addr1weth.add(ether('0.025')));
        expect(await this.dai.balanceOf(addr0)).to.be.bignumber.equal(addr0dai.add(ether('25')));
        expect(await this.dai.balanceOf(addr1)).to.be.bignumber.equal(addr1dai.sub(ether('25')));
    });

    it('triple recursive swap', async () => {
        const order1 = buildOrder(
            {
                makerAsset: this.dai.address,
                takerAsset: this.weth.address,
                makingAmount: ether('10'),
                takingAmount: ether('0.01'),
                salt: buildSalt(await time.latest()),
                from: addr1,
            },
            {
                predicate: this.swap.contract.methods.timestampBelow(0xff00000000).encodeABI(),
            },
        );

        const order2 = buildOrder(
            {
                makerAsset: this.dai.address,
                takerAsset: this.weth.address,
                makingAmount: ether('15'),
                takingAmount: ether('0.015'),
                salt: buildSalt(await time.latest()),
                from: addr1,
            },
            {
                predicate: this.swap.contract.methods.timestampBelow(0xff00000000).encodeABI(),
            },
        );

        const backOrder = buildOrder(
            {
                makerAsset: this.weth.address,
                takerAsset: this.dai.address,
                makingAmount: ether('0.025'),
                takingAmount: ether('25'),
                salt: buildSalt(await time.latest()),
                from: addr0,
            },
            {
                predicate: this.swap.contract.methods.timestampBelow(0xff00000000).encodeABI(),
            },
        );

        const signature1 = signOrder(order1, this.chainId, this.swap.address, addr1Wallet.getPrivateKey());
        const signature2 = signOrder(order2, this.chainId, this.swap.address, addr1Wallet.getPrivateKey());
        const signatureBackOrder = signOrder(backOrder, this.chainId, this.swap.address, addr0Wallet.getPrivateKey());

        const matchingParams = this.matcher.address + '01' + web3.eth.abi.encodeParameters(
            ['address[]', 'bytes[]'],
            [
                [
                    this.weth.address,
                    this.dai.address,
                ],
                [
                    this.weth.contract.methods.approve(this.swap.address, ether('0.025')).encodeABI(),
                    this.dai.contract.methods.approve(this.swap.address, ether('25')).encodeABI(),
                ],
            ],
        ).substring(2);

        const internalInteraction = this.matcher.address + '00' + this.swap.contract.methods.fillOrder(
            backOrder,
            signatureBackOrder,
            matchingParams,
            ether('0.025'),
            0,
            ether('25'),
        ).encodeABI().substring(10);

        const externalInteraction = this.matcher.address + '00' + this.swap.contract.methods.fillOrder(
            order2,
            signature2,
            internalInteraction,
            ether('15'),
            0,
            ether('0.015'),
        ).encodeABI().substring(10);

        const addr0weth = await this.weth.balanceOf(addr0);
        const addr1weth = await this.weth.balanceOf(addr1);
        const addr0dai = await this.dai.balanceOf(addr0);
        const addr1dai = await this.dai.balanceOf(addr1);

        await this.matcher.matchOrders(this.swap.address, order1, signature1, externalInteraction, ether('10'), 0, ether('0.01'));

        expect(await this.weth.balanceOf(addr0)).to.be.bignumber.equal(addr0weth.sub(ether('0.025')));
        expect(await this.weth.balanceOf(addr1)).to.be.bignumber.equal(addr1weth.add(ether('0.025')));
        expect(await this.dai.balanceOf(addr0)).to.be.bignumber.equal(addr0dai.add(ether('25')));
        expect(await this.dai.balanceOf(addr1)).to.be.bignumber.equal(addr1dai.sub(ether('25')));
    });

    describe('dutch auction for orders fee', async () => {
        const prerareRecursiveOrders = async (salt1Obj, salt2Obj) => {
            if (typeof salt1Obj.orderStartTime === 'undefined' ||
                typeof salt2Obj.orderStartTime === 'undefined') expect('orderStartTime must be set').to.be.equal('undefined');
            if (typeof salt1Obj.initialStartRate === 'undefined') salt1Obj.initialStartRate = '1000';
            if (typeof salt2Obj.initialStartRate === 'undefined') salt2Obj.initialStartRate = '1000';
            if (typeof salt1Obj.duration === 'undefined') salt1Obj.duration = '180';
            if (typeof salt2Obj.duration === 'undefined') salt2Obj.duration = '180';
            if (typeof salt1Obj.salt === 'undefined') salt1Obj.salt = '1';
            if (typeof salt2Obj.salt === 'undefined') salt2Obj.salt = '2';

            const order = buildOrder(
                {
                    makerAsset: this.dai.address,
                    takerAsset: this.weth.address,
                    makingAmount: ether('100'),
                    takingAmount: ether('0.1'),
                    salt: buildSalt(salt1Obj.orderStartTime, salt1Obj.initialStartRate, salt1Obj.duration, salt1Obj.salt),
                    from: addr0,
                },
                {
                    predicate: this.swap.contract.methods.timestampBelow(0xff00000000).encodeABI(),
                },
            );

            const backOrder = buildOrder(
                {
                    makerAsset: this.weth.address,
                    takerAsset: this.dai.address,
                    makingAmount: ether('0.1'),
                    takingAmount: ether('100'),
                    salt: buildSalt(salt2Obj.orderStartTime, salt2Obj.initialStartRate, salt2Obj.duration, salt2Obj.salt),
                    from: addr1,
                },
                {
                    predicate: this.swap.contract.methods.timestampBelow(0xff00000000).encodeABI(),
                },
            );

            const signature = signOrder(order, this.chainId, this.swap.address, addr0Wallet.getPrivateKey());
            const signatureBackOrder = signOrder(backOrder, this.chainId, this.swap.address, addr1Wallet.getPrivateKey());

            const matchingParams = this.matcher.address + '01' + web3.eth.abi.encodeParameters(
                ['address[]', 'bytes[]'],
                [
                    [
                        this.weth.address,
                        this.dai.address,
                    ],
                    [
                        this.weth.contract.methods.approve(this.swap.address, ether('0.1')).encodeABI(),
                        this.dai.contract.methods.approve(this.swap.address, ether('100')).encodeABI(),
                    ],
                ],
            ).substring(2);

            const interaction = this.matcher.address + '00' + this.swap.contract.methods.fillOrder(
                backOrder,
                signatureBackOrder,
                matchingParams,
                ether('0.1'),
                0,
                ether('100'),
            ).encodeABI().substring(10);

            return {
                order,
                signature,
                interaction,
            };
        };

        it('calculate fee for matching order', async () => {
            const currentTimestamp = await time.latest();
            const { order, signature, interaction } = await prerareRecursiveOrders({
                orderStartTime: currentTimestamp.sub(toBN('90')),
            }, {
                orderStartTime: currentTimestamp,
            });

            await this.matcher.matchOrders(this.swap.address, order, signature, interaction, ether('100'), 0, ether('0.1'));
            assertRoughlyEqualValues(toBN('10500'), await this.feeCollector.rates(0), 1e-3);
            assertRoughlyEqualValues(toBN('11000'), await this.feeCollector.rates(1), 1e-3);
        });

        it('calculate fee for back order', async () => {
            const currentTimestamp = await time.latest();
            const { order, signature, interaction } = await prerareRecursiveOrders({
                orderStartTime: currentTimestamp,
            }, {
                orderStartTime: currentTimestamp.sub(toBN('90')),
            });

            await this.matcher.matchOrders(this.swap.address, order, signature, interaction, ether('100'), 0, ether('0.1'));
            assertRoughlyEqualValues(toBN('11000'), await this.feeCollector.rates(0), 1e-3);
            assertRoughlyEqualValues(toBN('10500'), await this.feeCollector.rates(1), 1e-3);
        });

        it('throw, if orderStartTime hasn\'t come for matching order', async () => {
            const currentTimestamp = await time.latest();
            const { order, signature, interaction } = await prerareRecursiveOrders({
                orderStartTime: currentTimestamp.add(toBN('10')),
            }, {
                orderStartTime: currentTimestamp,
            });

            await expectRevert(
                this.matcher.matchOrders(this.swap.address, order, signature, interaction, ether('100'), 0, ether('0.1')),
                'IncorrectOrderStartTime()');
        });

        it('throw, if orderStartTime hasn\'t come for back order', async () => {
            const currentTimestamp = await time.latest();
            const { order, signature, interaction } = await prerareRecursiveOrders({
                orderStartTime: currentTimestamp,
            }, {
                orderStartTime: currentTimestamp.add(toBN('10')),
            });

            await expectRevert(
                this.matcher.matchOrders(this.swap.address, order, signature, interaction, ether('100'), 0, ether('0.1')),
                'IncorrectOrderStartTime()');
        });

        it('return minimal fee for matching order after duration', async () => {
            const currentTimestamp = await time.latest();
            const { order, signature, interaction } = await prerareRecursiveOrders({
                orderStartTime: currentTimestamp.sub(toBN('180')),
            }, {
                orderStartTime: currentTimestamp,
            });

            await this.matcher.matchOrders(this.swap.address, order, signature, interaction, ether('100'), 0, ether('0.1'));
            expect(await this.feeCollector.rates(0)).to.be.bignumber.equal(toBN('10000'));
            assertRoughlyEqualValues(toBN('11000'), await this.feeCollector.rates(1), 1e-3);
        });

        it('return minimal fee for back order after duration', async () => {
            const currentTimestamp = await time.latest();
            const { order, signature, interaction } = await prerareRecursiveOrders({
                orderStartTime: currentTimestamp,
            }, {
                orderStartTime: currentTimestamp.sub(toBN('180')),
            });

            await this.matcher.matchOrders(this.swap.address, order, signature, interaction, ether('100'), 0, ether('0.1'));
            assertRoughlyEqualValues(toBN('11000'), await this.feeCollector.rates(0), 1e-3);
            expect(await this.feeCollector.rates(1)).to.be.bignumber.equal(toBN('10000'));
        });

        it('change default initialRate for matching order', async () => {
            const currentTimestamp = await time.latest();
            const { order, signature, interaction } = await prerareRecursiveOrders({
                orderStartTime: currentTimestamp,
                initialStartRate: 2000,
            }, {
                orderStartTime: currentTimestamp,
            });

            await this.matcher.matchOrders(this.swap.address, order, signature, interaction, ether('100'), 0, ether('0.1'));
            assertRoughlyEqualValues(toBN('12000'), await this.feeCollector.rates(0), 1e-3);
            assertRoughlyEqualValues(toBN('11000'), await this.feeCollector.rates(1), 1e-3);
        });

        it('change default initialRate for back order', async () => {
            const currentTimestamp = await time.latest();
            const { order, signature, interaction } = await prerareRecursiveOrders({
                orderStartTime: currentTimestamp,
            }, {
                orderStartTime: currentTimestamp,
                initialStartRate: 2000,
            });

            await this.matcher.matchOrders(this.swap.address, order, signature, interaction, ether('100'), 0, ether('0.1'));
            assertRoughlyEqualValues(toBN('11000'), await this.feeCollector.rates(0), 1e-3);
            assertRoughlyEqualValues(toBN('12000'), await this.feeCollector.rates(1), 1e-3);
        });

        it('change default duration for matching order', async () => {
            const currentTimestamp = await time.latest();
            const { order, signature, interaction } = await prerareRecursiveOrders({
                orderStartTime: currentTimestamp.sub(toBN('180')),
                duration: 360,
            }, {
                orderStartTime: currentTimestamp,
            });

            await this.matcher.matchOrders(this.swap.address, order, signature, interaction, ether('100'), 0, ether('0.1'));
            assertRoughlyEqualValues(toBN('10500'), await this.feeCollector.rates(0), 1e-3);
            assertRoughlyEqualValues(toBN('11000'), await this.feeCollector.rates(1), 1e-3);
        });

        it('change default duration for back order', async () => {
            const currentTimestamp = await time.latest();
            const { order, signature, interaction } = await prerareRecursiveOrders({
                orderStartTime: currentTimestamp,
            }, {
                orderStartTime: currentTimestamp.sub(toBN('180')),
                duration: 360,
            });

            await this.matcher.matchOrders(this.swap.address, order, signature, interaction, ether('100'), 0, ether('0.1'));
            assertRoughlyEqualValues(toBN('11000'), await this.feeCollector.rates(0), 1e-3);
            assertRoughlyEqualValues(toBN('10500'), await this.feeCollector.rates(1), 1e-3);
        });
    });
});
