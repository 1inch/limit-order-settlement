const {
    expect,
    ether,
    toBN,
    assertRoughlyEqualValues,
    timeIncreaseTo,
    time,
    getPermit,
} = require('@1inch/solidity-utils');
const { addr0Wallet, addr1Wallet } = require('./helpers/utils');

const TokenPermitMock = artifacts.require('ERC20PermitMock');
const St1inch = artifacts.require('St1inch');

describe('St1inch', async () => {
    const [addr0, addr1] = [addr0Wallet.getAddressString(), addr1Wallet.getAddressString()];
    const baseExp = toBN('999999981746377019');

    const exp = (point, t) => {
        let base = baseExp;
        while (t.gt(toBN('0'))) {
            if (t.and(toBN('1')).eq(toBN('1'))) {
                point = point.mul(base).div(ether('1'));
            }
            base = base.mul(base).div(ether('1'));
            t = t.shrn(1);
        }

        return point;
    };

    const expInv = (point, t) => {
        let base = baseExp;
        while (t.gt(toBN('0'))) {
            if (t.and(toBN('1')).eq(toBN('1'))) {
                point = point.mul(ether('1')).div(base);
            }
            base = base.mul(base).div(ether('1'));
            t = t.shrn(1);
        }

        return point;
    };

    const checkBalances = async (account, balance, lockDuration) => {
        expect(await this.st1inch.depositsAmount(account)).to.be.bignumber.equal(balance);
        const t = (await time.latest()).add(lockDuration).sub(this.origin);
        const originPower = expInv(balance, t);
        expect(await this.st1inch.balanceOf(account)).to.be.bignumber.equal(originPower);
        expect(await this.st1inch.votingPowerOf(account)).to.be.bignumber.equal(
            exp(originPower, (await time.latest()).sub(this.origin)),
        );
        assertRoughlyEqualValues(
            await this.st1inch.votingPowerOfAt(account, await this.st1inch.unlockTime(account)),
            balance,
            1e-10,
        );
    };

    const checkBalancesPrecision = async (account, balance, lockDuration, precision) => {
        expect(await this.st1inch.depositsAmount(account)).to.be.bignumber.equal(balance);
        const t = (await time.latest()).add(lockDuration).sub(this.origin);
        const originPower = expInv(balance, t);

        assertRoughlyEqualValues(await this.st1inch.balanceOf(account), originPower, precision);
        assertRoughlyEqualValues(
            await this.st1inch.votingPowerOf(account),
            exp(originPower, (await time.latest()).sub(this.origin)),
            precision,
        );
        assertRoughlyEqualValues(
            await this.st1inch.votingPowerOfAt(account, await this.st1inch.unlockTime(account)),
            balance,
            precision,
        );
    };

    before(async () => {
        this.chainId = await web3.eth.getChainId();
    });

    beforeEach(async () => {
        this.oneInch = await TokenPermitMock.new('1inch', '1inch', addr0, ether('200'));
        await this.oneInch.transfer(addr1, ether('100'), { from: addr0 });

        const maxUserFarms = 5;
        const maxUserDelegations = 5;
        this.st1inch = await St1inch.new(this.oneInch.address, baseExp, maxUserFarms, maxUserDelegations);
        await this.oneInch.approve(this.st1inch.address, ether('100'));
        await this.oneInch.approve(this.st1inch.address, ether('100'), {
            from: addr1,
        });
        this.origin = await this.st1inch.origin();
    });

    it('should take users deposit', async () => {
        expect(await this.st1inch.depositsAmount(addr0)).to.be.bignumber.equal(toBN('0'));
        expect(await this.st1inch.balanceOf(addr0)).to.be.bignumber.equal(toBN('0'));
        expect(await this.st1inch.votingPowerOf(addr0)).to.be.bignumber.equal(toBN('0'));

        await this.st1inch.deposit(ether('100'), time.duration.days('1'));

        await checkBalances(addr0, ether('100'), time.duration.days('1'));
    });

    it('should take users deposit with permit', async () => {
        expect(await this.st1inch.depositsAmount(addr0)).to.be.bignumber.equal(toBN('0'));
        expect(await this.st1inch.balanceOf(addr0)).to.be.bignumber.equal(toBN('0'));
        expect(await this.st1inch.votingPowerOf(addr0)).to.be.bignumber.equal(toBN('0'));
        await this.oneInch.approve(this.st1inch.address, '0');
        const permit = await getPermit(
            addr0,
            addr0Wallet.getPrivateKey(),
            this.oneInch,
            '1',
            this.chainId,
            this.st1inch.address,
            ether('100'),
        );

        await this.st1inch.depositWithPermit(ether('100'), time.duration.days('1'), permit);

        await checkBalances(addr0, ether('100'), time.duration.days('1'));
    });

    it('should take users deposit for other account', async () => {
        expect(await this.st1inch.depositsAmount(addr1)).to.be.bignumber.equal(toBN('0'));
        expect(await this.st1inch.balanceOf(addr1)).to.be.bignumber.equal(toBN('0'));
        expect(await this.st1inch.votingPowerOf(addr1)).to.be.bignumber.equal(toBN('0'));
        const balanceAddr0 = await this.oneInch.balanceOf(addr0);
        const balanceAddr1 = await this.oneInch.balanceOf(addr1);

        await this.st1inch.depositFor(addr1, ether('100'), time.duration.days('1'));

        expect(await this.oneInch.balanceOf(addr0)).to.be.bignumber.equal(balanceAddr0.sub(ether('100')));
        expect(await this.oneInch.balanceOf(addr1)).to.be.bignumber.equal(balanceAddr1);
        await checkBalances(addr1, ether('100'), time.duration.days('1'));
        expect(await this.st1inch.depositsAmount(addr0)).to.be.bignumber.equal(toBN('0'));
        expect(await this.st1inch.balanceOf(addr0)).to.be.bignumber.equal(toBN('0'));
        expect(await this.st1inch.votingPowerOf(addr0)).to.be.bignumber.equal(toBN('0'));
    });

    it('should take users deposit with permit for other account', async () => {
        expect(await this.st1inch.depositsAmount(addr1)).to.be.bignumber.equal(toBN('0'));
        expect(await this.st1inch.balanceOf(addr1)).to.be.bignumber.equal(toBN('0'));
        expect(await this.st1inch.votingPowerOf(addr1)).to.be.bignumber.equal(toBN('0'));
        const balanceAddr0 = await this.oneInch.balanceOf(addr0);
        const balanceAddr1 = await this.oneInch.balanceOf(addr1);
        await this.oneInch.approve(this.st1inch.address, '0');
        const permit = await getPermit(
            addr0,
            addr0Wallet.getPrivateKey(),
            this.oneInch,
            '1',
            this.chainId,
            this.st1inch.address,
            ether('100'),
        );

        await this.st1inch.depositForWithPermit(addr1, ether('100'), time.duration.days('1'), permit);

        expect(await this.oneInch.balanceOf(addr0)).to.be.bignumber.equal(balanceAddr0.sub(ether('100')));
        expect(await this.oneInch.balanceOf(addr1)).to.be.bignumber.equal(balanceAddr1);
        await checkBalances(addr1, ether('100'), time.duration.days('1'));
        expect(await this.st1inch.depositsAmount(addr0)).to.be.bignumber.equal(toBN('0'));
        expect(await this.st1inch.balanceOf(addr0)).to.be.bignumber.equal(toBN('0'));
        expect(await this.st1inch.votingPowerOf(addr0)).to.be.bignumber.equal(toBN('0'));
    });

    it('should increase unlock time for deposit (call deposit)', async () => {
        await this.st1inch.deposit(ether('100'), time.duration.days('1'));
        await timeIncreaseTo(await this.st1inch.unlockTime(addr0));

        await this.st1inch.deposit(toBN('0'), time.duration.years('2'));
        await checkBalances(addr0, ether('100'), time.duration.years('2'));
    });

    it('should increase unlock time for deposit (call increaseLockDuration)', async () => {
        await this.st1inch.deposit(ether('70'), time.duration.days('1'));
        await timeIncreaseTo(await this.st1inch.unlockTime(addr0));

        await this.st1inch.increaseLockDuration(time.duration.days('10'));
        await checkBalances(addr0, ether('70'), time.duration.days('10'));
    });

    it('should increase deposit amount (call deposit)', async () => {
        await this.st1inch.deposit(ether('20'), time.duration.days('10'));

        const unlockTime = await this.st1inch.unlockTime(addr0);
        await timeIncreaseTo(unlockTime.sub(time.duration.days('5')));

        await this.st1inch.deposit(ether('30'), toBN('0'));
        await checkBalances(addr0, ether('50'), unlockTime.sub(await time.latest()));
    });

    it('should increase deposit amount (call deposit, 1 year lock)', async () => {
        await this.st1inch.deposit(ether('20'), time.duration.days('365'));

        const unlockTime = await this.st1inch.unlockTime(addr0);
        await timeIncreaseTo(unlockTime);
        await checkBalancesPrecision(addr0, ether('20'), toBN(0), 1e-7);
    });

    it('should increase deposit amount (call deposit, 2 year lock)', async () => {
        await this.st1inch.deposit(ether('20'), time.duration.days('730'));

        const unlockTime = await this.st1inch.unlockTime(addr0);
        await timeIncreaseTo(unlockTime);
        await checkBalancesPrecision(addr0, ether('20'), toBN(0), 1e-7);
    });

    it('should increase deposit amount (call deposit, 3 year lock)', async () => {
        await this.st1inch.deposit(ether('20'), time.duration.days('1095'));

        const unlockTime = await this.st1inch.unlockTime(addr0);
        await timeIncreaseTo(unlockTime);
        await checkBalancesPrecision(addr0, ether('20'), toBN(0), 1e-7);
    });

    it('should increase deposit amount (call deposit, 4 year lock)', async () => {
        await this.st1inch.deposit(ether('20'), time.duration.days('1460'));

        const unlockTime = await this.st1inch.unlockTime(addr0);
        await timeIncreaseTo(unlockTime);
        await checkBalancesPrecision(addr0, ether('20'), toBN(0), 1e-7);
    });

    it('should increase deposit amount (call increaseAmount)', async () => {
        await this.st1inch.deposit(ether('70'), time.duration.days('100'));

        const unlockTime = await this.st1inch.unlockTime(addr0);
        await timeIncreaseTo(unlockTime.sub(time.duration.days('50')));

        await this.st1inch.increaseAmount(ether('20'));
        await checkBalances(addr0, ether('90'), unlockTime.sub(await time.latest()));
    });

    it('should withdraw users deposit', async () => {
        await this.st1inch.deposit(ether('100'), time.duration.days('50'));

        const unlockTime = await this.st1inch.unlockTime(addr0);
        await timeIncreaseTo(unlockTime);
        const balanceAddr0 = await this.oneInch.balanceOf(addr0);

        await this.st1inch.withdraw();

        expect(await this.oneInch.balanceOf(addr0)).to.be.bignumber.equal(balanceAddr0.add(ether('100')));
        expect(await this.st1inch.depositsAmount(addr0)).to.be.bignumber.equal(toBN('0'));
        expect(await this.st1inch.balanceOf(addr0)).to.be.bignumber.equal(toBN('0'));
        expect(await this.st1inch.votingPowerOf(addr0)).to.be.bignumber.equal(toBN('0'));
    });

    it('should withdraw users deposit', async () => {
        await this.st1inch.deposit(ether('100'), time.duration.days('50'));

        const unlockTime = await this.st1inch.unlockTime(addr0);
        await timeIncreaseTo(unlockTime);
        const balanceAddr0 = await this.oneInch.balanceOf(addr0);

        await this.st1inch.withdraw();

        expect(await this.oneInch.balanceOf(addr0)).to.be.bignumber.equal(balanceAddr0.add(ether('100')));
        expect(await this.st1inch.depositsAmount(addr0)).to.be.bignumber.equal(toBN('0'));
        expect(await this.st1inch.balanceOf(addr0)).to.be.bignumber.equal(toBN('0'));
        expect(await this.st1inch.votingPowerOf(addr0)).to.be.bignumber.equal(toBN('0'));
    });

    it('should withdraw users deposit and send tokens to other address', async () => {
        await this.st1inch.deposit(ether('100'), time.duration.days('50'));

        const unlockTime = await this.st1inch.unlockTime(addr0);
        await timeIncreaseTo(unlockTime);
        const balanceAddr0 = await this.oneInch.balanceOf(addr0);
        const balanceAddr1 = await this.oneInch.balanceOf(addr1);

        await this.st1inch.withdrawTo(addr1);

        expect(await this.oneInch.balanceOf(addr0)).to.be.bignumber.equal(balanceAddr0);
        expect(await this.oneInch.balanceOf(addr1)).to.be.bignumber.equal(balanceAddr1.add(ether('100')));
        expect(await this.st1inch.depositsAmount(addr0)).to.be.bignumber.equal(toBN('0'));
        expect(await this.st1inch.balanceOf(addr0)).to.be.bignumber.equal(toBN('0'));
        expect(await this.st1inch.votingPowerOf(addr0)).to.be.bignumber.equal(toBN('0'));
    });

    it('should not increase time and amount for existing deposit', async () => {
        await this.st1inch.deposit(ether('50'), time.duration.days('1'));

        await expect(this.st1inch.deposit(ether('50'), time.duration.days('1'))).to.be.rejectedWith(
            'ChangeAmountAndUnlockTimeForExistingAccount()',
        );
    });

    it('should not take deposit with lock less then MIN_LOCK_PERIOD', async () => {
        const MIN_LOCK_PERIOD = await this.st1inch.MIN_LOCK_PERIOD();
        await expect(this.st1inch.deposit(ether('50'), MIN_LOCK_PERIOD.sub(toBN('1')))).to.be.rejectedWith(
            'LockTimeLessMinLock()',
        );
    });

    it('should not take deposit with lock more then MAX_LOCK_PERIOD', async () => {
        const MAX_LOCK_PERIOD = await this.st1inch.MAX_LOCK_PERIOD();
        await expect(this.st1inch.deposit(ether('50'), MAX_LOCK_PERIOD.add(toBN('1')))).to.be.rejectedWith(
            'LockTimeMoreMaxLock()',
        );
    });

    it('should withdraw before unlock time', async () => {
        await this.st1inch.deposit(ether('50'), time.duration.days('1'));

        await expect(this.st1inch.withdraw()).to.be.rejectedWith('UnlockTimeWasNotCome()');
    });

    it('should emergency withdraw', async () => {
        await this.st1inch.deposit(ether('50'), time.duration.days('1'));
        const balanceAddr0 = await this.oneInch.balanceOf(addr0);
        expect(await this.st1inch.emergencyExit()).to.be.equal(false);

        await this.st1inch.setEmergencyExit(true);
        await this.st1inch.withdraw();

        expect(await this.st1inch.emergencyExit()).to.be.equal(true);
        expect(await this.oneInch.balanceOf(addr0)).to.be.bignumber.equal(balanceAddr0.add(ether('50')));
    });

    it("shouldn't call setEmergencyExit if caller isn't the owner", async () => {
        await expect(this.st1inch.setEmergencyExit(true, { from: addr1 })).to.be.rejectedWith(
            'Ownable: caller is not the owner',
        );
    });
});
