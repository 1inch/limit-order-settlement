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
                makingAmount: ether('0.11'),
                takingAmount: ether('100'),
                salt: buildSalt((await time.latest()).sub(toBN('1800'))),
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
                    this.weth.contract.methods.approve(this.swap.address, ether('0.11')).encodeABI(),
                    this.dai.contract.methods.approve(this.swap.address, ether('100.00')).encodeABI(),
                ],
            ],
        ).substring(2);

        const interaction = this.matcher.address + '00' + this.swap.contract.methods.fillOrder(
            backOrder,
            signatureBackOrder,
            matchingParams,
            ether('0.11'),
            0,
            ether('100'),
        ).encodeABI().substring(10);

        const addr0weth = await this.weth.balanceOf(addr0);
        const addr1weth = await this.weth.balanceOf(addr1);
        const addr0dai = await this.dai.balanceOf(addr0);
        const addr1dai = await this.dai.balanceOf(addr1);

        await this.matcher.matchOrders(this.swap.address, order, signature, interaction, ether('100'), 0, ether('0.11'));

        assertRoughlyEqualValues(await this.weth.balanceOf(addr0), addr0weth.add(ether('0.11')), 1e-4);
        // TODO: 6e-5 WETH lost into LimitOrderProtocol contract
        expect(await this.weth.balanceOf(addr1)).to.be.bignumber.equal(addr1weth.sub(ether('0.11')));
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
                    this.weth.contract.methods.transferFrom(addr0, this.matcher.address, ether('0.0275')).encodeABI(),
                    this.weth.contract.methods.approve(this.swap.address, ether('0.0275')).encodeABI(),
                    this.dai.contract.methods.transfer(addr0, ether('25')).encodeABI(),
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

        await this.weth.approve(this.matcher.address, ether('0.0275'));
        await this.matcher.matchOrders(this.swap.address, order, signature, interaction, ether('10'), 0, ether('0.01'));

        expect(await this.weth.balanceOf(addr0)).to.be.bignumber.equal(addr0weth.sub(ether('0.0275')));
        assertRoughlyEqualValues(await this.weth.balanceOf(addr1), addr1weth.add(ether('0.0275')), 1e-4);
        // TODO: 3e-5 WETH lost into LimitOrderProtocol contract
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
                makingAmount: ether('0.0275'),
                takingAmount: ether('25'),
                salt: buildSalt((await time.latest()).sub(toBN('1800'))),
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
                    this.weth.contract.methods.approve(this.swap.address, ether('0.0275')).encodeABI(),
                    this.dai.contract.methods.approve(this.swap.address, ether('25')).encodeABI(),
                ],
            ],
        ).substring(2);

        const internalInteraction = this.matcher.address + '00' + this.swap.contract.methods.fillOrder(
            backOrder,
            signatureBackOrder,
            matchingParams,
            ether('0.0275'),
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

        expect(await this.weth.balanceOf(addr0)).to.be.bignumber.equal(addr0weth.sub(ether('0.0275')));
        assertRoughlyEqualValues(await this.weth.balanceOf(addr1), addr1weth.add(ether('0.0275')), 1e-4);
        // TODO: 15e-6 WETH lost into LimitOrderProtocol contract
        expect(await this.dai.balanceOf(addr0)).to.be.bignumber.equal(addr0dai.add(ether('25')));
        expect(await this.dai.balanceOf(addr1)).to.be.bignumber.equal(addr1dai.sub(ether('25')));
    });

    describe('dutch auction params', async () => {
        const prerareSingleOrder = async (orderStartTime, initialRate = '1000', duration = '1800', salt = '1') => {
            const makerAsset = this.dai.address;
            const takerAsset = this.weth.address;
            const makingAmount = ether('100');
            const takingAmount = ether('0.1');
            const order = buildOrder(
                {
                    makerAsset,
                    takerAsset,
                    makingAmount,
                    takingAmount,
                    salt: buildSalt(orderStartTime, initialRate, duration, salt),
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
                //    _BASE_POINTS + initialRate * (orderTime + duration - currentTimestamp) / duration
                // ) / _BASE_POINTS
                actualTakingAmount = actualTakingAmount.mul(
                    toBN('10000').add(toBN(initialRate).mul(toBN(orderStartTime).add(toBN(duration)).sub(ts)).div(toBN(duration))),
                ).div(toBN('10000'));
            }

            const matchingParams = this.matcher.address + '01' + web3.eth.abi.encodeParameters(
                ['address[]', 'bytes[]'],
                [
                    [
                        this.weth.address,
                        this.weth.address,
                        this.dai.address,
                    ],
                    [
                        this.weth.contract.methods.transferFrom(addr0, this.matcher.address, actualTakingAmount).encodeABI(),
                        this.weth.contract.methods.approve(this.swap.address, actualTakingAmount).encodeABI(),
                        this.dai.contract.methods.transfer(addr0, makingAmount).encodeABI(),
                    ],
                ],
            ).substring(2);

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

        it('can\'t match order before orderTime', async () => {
            const currentTimestamp = await time.latest();
            const { order, signature, interaction, makingAmount, takingAmount } = await prerareSingleOrder(currentTimestamp.addn(60));

            await expectRevert(
                this.matcher.matchOrders(this.swap.address, order, signature, interaction, makingAmount, 0, takingAmount),
                'IncorrectOrderStartTime()',
            );
        });

        it('set initial rate', async () => {
            const currentTimestamp = await time.latest();
            const { order, signature, interaction, makingAmount, takingAmount } = await prerareSingleOrder(currentTimestamp, '2000');

            const addr0weth = await this.weth.balanceOf(addr0);
            const addr1weth = await this.weth.balanceOf(addr1);
            await this.matcher.matchOrders(this.swap.address, order, signature, interaction, makingAmount, 0, takingAmount);

            expect(await this.weth.balanceOf(addr0)).to.be.bignumber.equal(addr0weth.sub(ether('0.12')));
            assertRoughlyEqualValues(await this.weth.balanceOf(addr1), addr1weth.add(ether('0.12')), 1e-4);
        });

        it('set duration', async () => {
            const currentTimestamp = await time.latest();
            const { order, signature, interaction, makingAmount, takingAmount } = await prerareSingleOrder(currentTimestamp.subn(450), '1000', '900');

            const addr0weth = await this.weth.balanceOf(addr0);
            const addr1weth = await this.weth.balanceOf(addr1);
            await this.matcher.matchOrders(this.swap.address, order, signature, interaction, makingAmount, 0, takingAmount);

            expect(await this.weth.balanceOf(addr0)).to.be.bignumber.equal(addr0weth.sub(ether('0.105')));
            assertRoughlyEqualValues(await this.weth.balanceOf(addr1), addr1weth.add(ether('0.105')), 1e-4);
        });
    });
});
