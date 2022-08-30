const { expect, ether, toBN } = require('@1inch/solidity-utils');
const { addr0Wallet, addr1Wallet } = require('./helpers/utils');

const TokenMock = artifacts.require('TokenMock');
const WrappedTokenMock = artifacts.require('WrappedTokenMock');
const LimitOrderProtocol = artifacts.require('LimitOrderProtocol');
const WhitelistRegistrySimple = artifacts.require('WhitelistRegistrySimple');
const Settlement = artifacts.require('Settlement');
const FeeBank = artifacts.require('FeeBank');

const { buildOrder, signOrder } = require('./helpers/orderUtils');

const Status = Object.freeze({
    Unverified: toBN('0'),
    Verified: toBN('1'),
});

describe('Settlement', async () => {
    const [addr0, addr1] = [addr0Wallet.getAddressString(), addr1Wallet.getAddressString()];

    before(async () => {
        this.chainId = await web3.eth.getChainId();
        this.whitelistRegistrySimple = await WhitelistRegistrySimple.new();
        await this.whitelistRegistrySimple.setStatus(addr0, Status.Verified);
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
        await this.dai.approve(this.swap.address, ether('100'), { from: addr1 });
        await this.weth.approve(this.swap.address, ether('1'));
        await this.weth.approve(this.swap.address, ether('1'), { from: addr1 });

        this.matcher = await Settlement.new(this.whitelistRegistrySimple.address, this.swap.address);
        this.feeBank = await FeeBank.new(this.matcher.address, this.inch.address);
        await this.matcher.setFeeBank(this.feeBank.address);

        await this.inch.approve(this.feeBank.address, ether('100'));
        await this.feeBank.deposit(ether('100'));
    });

    it('opposite direction recursive swap', async () => {
        const order = buildOrder(
            {
                makerAsset: this.dai.address,
                takerAsset: this.weth.address,
                makingAmount: ether('100'),
                takingAmount: ether('0.1'),
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

    it('should change creditAllowance with non-zero fee', async () => {
        const orderFee = 100;
        const backOrderFee = 125;
        const order = buildOrder(
            { makerAsset: this.dai.address, takerAsset: this.weth.address, makingAmount: ether('100'), takingAmount: ether('0.1'), from: addr0 },
            { salt: toBN('1').or(toBN(orderFee).shln(104)).add(toBN(2).pow(toBN(255))).toString() },
        );
        const backOrder = buildOrder(
            { makerAsset: this.weth.address, takerAsset: this.dai.address, makingAmount: ether('0.1'), takingAmount: ether('100'), from: addr1 },
            { salt: toBN('1').or(toBN(backOrderFee).shln(104)).add(toBN(2).pow(toBN(255))).toString() },
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
        const interaction = this.matcher.address + '00' +
            this.swap.contract.methods.fillOrder(backOrder, signatureBackOrder, matchingParams, ether('0.1'), 0, ether('100')).encodeABI().substring(10);

        const creditAllowanceBefore = await this.matcher.creditAllowance(addr0);
        await this.matcher.matchOrdersEOA(this.swap.address, order, signature, interaction, ether('100'), 0, ether('0.1'));
        expect(await this.matcher.creditAllowance(addr0)).to.be.bignumber.eq(creditAllowanceBefore.subn(orderFee).subn(backOrderFee));
    });

    it('should not change when creditAllowance is not enough', async () => {
        const orderFee = ether('1000').toString();
        const backOrderFee = 125;
        const order = buildOrder(
            { makerAsset: this.dai.address, takerAsset: this.weth.address, makingAmount: ether('100'), takingAmount: ether('0.1'), from: addr0 },
            { salt: toBN('1').or(toBN(orderFee).shln(104)).add(toBN(2).pow(toBN(255))).toString() },
        );
        const backOrder = buildOrder(
            { makerAsset: this.weth.address, takerAsset: this.dai.address, makingAmount: ether('0.1'), takingAmount: ether('100'), from: addr1 },
            { salt: toBN('1').or(toBN(backOrderFee).shln(104)).add(toBN(2).pow(toBN(255))).toString() },
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
        const interaction = this.matcher.address + '00' +
            this.swap.contract.methods.fillOrder(backOrder, signatureBackOrder, matchingParams, ether('0.1'), 0, ether('100')).encodeABI().substring(10);

        await expect(this.matcher.matchOrdersEOA(this.swap.address, order, signature, interaction, ether('100'), 0, ether('0.1')))
            .to.eventually.be.rejectedWith('NotEnoughCredit()');
    });

    describe('setFeeBank', async () => {
        it('should change feeBank', async () => {
            expect(await this.matcher.feeBank()).to.be.not.equals(addr1);
            await this.matcher.setFeeBank(addr1);
            expect((await this.matcher.feeBank()).toLowerCase()).to.be.equals(addr1.toLowerCase());
        });

        it('should not change feeBank by non-owner', async () => {
            await expect(this.matcher.setFeeBank(addr1, { from: addr1 }))
                .to.eventually.be.rejectedWith('Ownable: caller is not the owner');
        });
    });

    describe('addCreditAllowance', async () => {
        it('should increase credit', async () => {
            const amount = ether('100');
            expect(await this.matcher.creditAllowance(addr1)).to.be.bignumber.eq('0');
            await this.matcher.setFeeBank(addr0);
            await this.matcher.addCreditAllowance(addr1, amount);
            expect(await this.matcher.creditAllowance(addr1)).to.be.bignumber.eq(amount);
        });

        it('should not increase credit by non-feeBank address', async () => {
            await expect(this.matcher.addCreditAllowance(addr1, ether('100')))
                .to.eventually.be.rejectedWith('OnlyFeeBankAccess()');
        });
    });

    describe('subCreditAllowance', async () => {
        beforeEach(async () => {
            this.creditAmount = ether('100');
            await this.matcher.setFeeBank(addr0);
            await this.matcher.addCreditAllowance(addr1, this.creditAmount);
        });

        it('should decrease credit', async () => {
            const amount = ether('10');
            expect(await this.matcher.creditAllowance(addr1)).to.be.bignumber.eq(this.creditAmount);
            await this.matcher.subCreditAllowance(addr1, amount);
            expect(await this.matcher.creditAllowance(addr1)).to.be.bignumber.eq(this.creditAmount.sub(amount));
        });

        it('should not deccrease credit by non-feeBank address', async () => {
            await this.matcher.setFeeBank(this.feeBank.address);
            await expect(this.matcher.subCreditAllowance(addr1, ether('10')))
                .to.eventually.be.rejectedWith('OnlyFeeBankAccess()');
        });
    });
});
