const { expect, ether, toBN, assertRoughlyEqualValues } = require('@1inch/solidity-utils');
const { time } = require('@openzeppelin/test-helpers');
const { addr0Wallet, addr1Wallet } = require('./helpers/utils');

const TokenMock = artifacts.require('TokenMock');
const St1inch = artifacts.require('St1inch');

describe('St1inch', async () => {
    const [addr0, addr1] = [addr0Wallet.getAddressString(), addr1Wallet.getAddressString()];
    const baseExp = toBN('999999981746377019');
    const invertBaseExp = ether('1000000000000000000').div(baseExp);

    const exp = (point, t, base = baseExp) => {
        while (t.gt(toBN('0'))) {
            if ((t.and(toBN('1'))).eq(toBN('1'))) {
                console.log('t-js', t.toString());
                point = point.mul(base).div(ether('1'));
                console.log('js', point.toString());
            }
            base = base.mul(base).div(ether('1'));
            t = t.shrn(1);
        }

        return point;
    };

    beforeEach(async () => {
        this.oneInch = await TokenMock.new('1inch', '1inch');
        await this.oneInch.mint(addr0, ether('100'));
        await this.oneInch.mint(addr1, ether('100'));

        this.st1inch = await St1inch.new(this.oneInch.address, baseExp);
        await this.oneInch.approve(this.st1inch.address, ether('100'));
        await this.oneInch.approve(this.st1inch.address, ether('100'), { from: addr1 });
        this.origin = await this.st1inch.origin();
    });

    it('deposit 1inch to st1inch', async () => {
        expect(await this.st1inch.depositsAmount(addr0)).to.be.bignumber.equal(toBN('0'));

        await this.st1inch.deposit(ether('100'), time.duration.days('1'));

        expect(await this.st1inch.depositsAmount(addr0)).to.be.bignumber.equal(ether('100'));
        const t = (await time.latest()).add(time.duration.days('1')).sub(this.origin);
        const originPower = exp(ether('100'), t, invertBaseExp);
        expect(await this.st1inch.balanceOf(addr0)).to.be.bignumber.equal(originPower);
        expect(await this.st1inch.votingPowerOf(addr0)).to.be.bignumber.equal(exp(originPower, (await time.latest()).sub(this.origin)));
        assertRoughlyEqualValues(
            await this.st1inch.methods['votingPowerOf(address,uint256)'](addr0, (await this.st1inch.unlockTime(addr0))),
            ether('100'),
            1e-13,
        );
    });
});
