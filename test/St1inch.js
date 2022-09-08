const { expect, ether, toBN } = require('@1inch/solidity-utils');
const { time } = require('@openzeppelin/test-helpers');
const { addr0Wallet, addr1Wallet } = require('./helpers/utils');

const TokenMock = artifacts.require('TokenMock');
const St1inch = artifacts.require('St1inch');

describe('St1inch', async () => {
    const [addr0, addr1] = [addr0Wallet.getAddressString(), addr1Wallet.getAddressString()];

    beforeEach(async () => {
        this.oneInch = await TokenMock.new('1inch', '1inch');
        await this.oneInch.mint(addr0, ether('100'));
        await this.oneInch.mint(addr1, ether('100'));

        this.st1inch = await St1inch.new(this.oneInch.address, toBN('999999999999999999'));
        await this.oneInch.approve(this.st1inch.address, ether('100'));
        await this.oneInch.approve(this.st1inch.address, ether('100'), { from: addr1 });
    });

    it('deposit 1inch to st1inch', async () => {
        expect(await this.st1inch.depositsAmount(addr0)).to.be.bignumber.equal(toBN('0'));
        await this.st1inch.deposit(ether('100'), time.duration.days('1'));

        expect(await this.st1inch.depositsAmount(addr0)).to.be.bignumber.equal(ether('100'));
    });
});