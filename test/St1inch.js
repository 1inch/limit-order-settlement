const { expect, assertRoughlyEqualValues, timeIncreaseTo, time, getPermit } = require('@1inch/solidity-utils');
const { BigNumber: BN } = require('ethers');
const { ethers } = require('hardhat');
const { ether } = require('./helpers/orderUtils');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { getChainId } = require('./helpers/fixtures');

describe('St1inch', async () => {
    let addr, addr1;
    const baseExp = BN.from('999999981746377019');
    const votingPowerDivider = BN.from(10);
    let chainId;

    const exp = (point, t) => {
        let base = baseExp;
        while (t > BigInt(0)) {
            if ((t & BigInt(1)) === BigInt(1)) {
                point = point.mul(base).div(ether('1'));
            }
            base = base.mul(base).div(ether('1'));
            t = t >> BigInt(1);
        }
        return point;
    };

    const expInv = (point, t) => {
        let base = baseExp;
        while (t > BigInt(0)) {
            if ((t & BigInt(1)) === BigInt(1)) {
                point = point.mul(ether('1')).div(base);
            }
            base = base.mul(base).div(ether('1'));
            t = t >> BigInt(1);
        }
        return point;
    };

    const checkBalances = async (account, balance, lockDuration, st1inch) => {
        const origin = await st1inch.origin();
        expect(await st1inch.depositsAmount(account)).to.equal(balance);
        const t = BigInt(
            BN.from(await time.latest())
                .add(lockDuration)
                .sub(origin),
        );
        const originPower = expInv(balance, t).div(votingPowerDivider);
        expect(await st1inch.balanceOf(account)).to.equal(originPower);
        expect(await st1inch.votingPowerOf(account)).to.equal(
            exp(originPower, BigInt(BN.from(await time.latest()).sub(origin))),
        );
        assertRoughlyEqualValues(
            await st1inch.votingPowerOfAt(account, await st1inch.unlockTime(account)),
            balance.div(votingPowerDivider),
            1e-10,
        );
    };

    async function initContracts() {
        const TokenPermitMock = await ethers.getContractFactory('ERC20PermitMock');
        const oneInch = await TokenPermitMock.deploy('1inch', '1inch', addr.address, ether('200'));
        await oneInch.deployed();
        await oneInch.transfer(addr1.address, ether('100'));

        const maxUserFarms = 5;
        const maxUserDelegations = 5;
        const St1inch = await ethers.getContractFactory('St1inch');
        const st1inch = await St1inch.deploy(oneInch.address, baseExp, maxUserFarms, maxUserDelegations);
        await st1inch.deployed();
        await oneInch.approve(st1inch.address, ether('100'));
        await oneInch.connect(addr1).approve(st1inch.address, ether('100'));

        return { oneInch, st1inch };
    }

    before(async () => {
        [addr, addr1] = await ethers.getSigners();
        chainId = await getChainId();
    });

    it('should take users deposit', async () => {
        const { st1inch } = await loadFixture(initContracts);

        expect(await st1inch.depositsAmount(addr.address)).to.equal(0);
        expect(await st1inch.balanceOf(addr.address)).to.equal(0);
        expect(await st1inch.votingPowerOf(addr.address)).to.equal(0);

        await st1inch.deposit(ether('100'), time.duration.days('1'));

        await checkBalances(addr.address, ether('100'), time.duration.days('1'), st1inch);
    });

    it('should take users deposit with permit', async () => {
        const { oneInch, st1inch } = await loadFixture(initContracts);

        expect(await st1inch.depositsAmount(addr.address)).to.equal(0);
        expect(await st1inch.balanceOf(addr.address)).to.equal(0);
        expect(await st1inch.votingPowerOf(addr.address)).to.equal(0);
        await oneInch.approve(st1inch.address, '0');
        const permit = await getPermit(addr, oneInch, '1', chainId, st1inch.address, ether('100'));

        await st1inch.depositWithPermit(ether('100'), time.duration.days('1'), permit);

        await checkBalances(addr.address, ether('100'), time.duration.days('1'), st1inch);
    });

    it('should take users deposit for other account', async () => {
        const { oneInch, st1inch } = await loadFixture(initContracts);

        expect(await st1inch.depositsAmount(addr1.address)).to.equal(0);
        expect(await st1inch.balanceOf(addr1.address)).to.equal(0);
        expect(await st1inch.votingPowerOf(addr1.address)).to.equal(0);
        const balanceaddr = await oneInch.balanceOf(addr.address);
        const balanceAddr1 = await oneInch.balanceOf(addr1.address);

        await st1inch.depositFor(addr1.address, ether('100'), time.duration.days('1'));

        expect(await oneInch.balanceOf(addr.address)).to.equal(balanceaddr.sub(ether('100')));
        expect(await oneInch.balanceOf(addr1.address)).to.equal(balanceAddr1);
        await checkBalances(addr1.address, ether('100'), time.duration.days('1'), st1inch);
        expect(await st1inch.depositsAmount(addr.address)).to.equal(0);
        expect(await st1inch.balanceOf(addr.address)).to.equal(0);
        expect(await st1inch.votingPowerOf(addr.address)).to.equal(0);
    });

    it('should take users deposit with permit for other account', async () => {
        const { oneInch, st1inch } = await loadFixture(initContracts);

        expect(await st1inch.depositsAmount(addr1.address)).to.equal(0);
        expect(await st1inch.balanceOf(addr1.address)).to.equal(0);
        expect(await st1inch.votingPowerOf(addr1.address)).to.equal(0);
        const balanceaddr = await oneInch.balanceOf(addr.address);
        const balanceAddr1 = await oneInch.balanceOf(addr1.address);
        await oneInch.approve(st1inch.address, '0');
        const permit = await getPermit(addr, oneInch, '1', chainId, st1inch.address, ether('100'));

        await st1inch.depositForWithPermit(addr1.address, ether('100'), time.duration.days('1'), permit);

        expect(await oneInch.balanceOf(addr.address)).to.equal(balanceaddr.sub(ether('100')));
        expect(await oneInch.balanceOf(addr1.address)).to.equal(balanceAddr1);
        await checkBalances(addr1.address, ether('100'), time.duration.days('1'), st1inch);
        expect(await st1inch.depositsAmount(addr.address)).to.equal(0);
        expect(await st1inch.balanceOf(addr.address)).to.equal(0);
        expect(await st1inch.votingPowerOf(addr.address)).to.equal(0);
    });

    it('should increase unlock time for deposit (call deposit)', async () => {
        const { st1inch } = await loadFixture(initContracts);
        await st1inch.deposit(ether('100'), time.duration.days('1'));
        await timeIncreaseTo(await st1inch.unlockTime(addr.address));

        await st1inch.deposit(0, time.duration.years('2'));
        await checkBalances(addr.address, ether('100'), time.duration.years('2'), st1inch);
    });

    it('should increase unlock time for deposit (call increaseLockDuration)', async () => {
        const { st1inch } = await loadFixture(initContracts);
        await st1inch.deposit(ether('70'), time.duration.days('1'));
        await timeIncreaseTo(await st1inch.unlockTime(addr.address));

        await st1inch.increaseLockDuration(time.duration.days('10'));
        await checkBalances(addr.address, ether('70'), time.duration.days('10'), st1inch);
    });

    it('should increase deposit amount (call deposit)', async () => {
        const { st1inch } = await loadFixture(initContracts);
        await st1inch.deposit(ether('20'), time.duration.days('10'));

        const unlockTime = await st1inch.unlockTime(addr.address);
        await timeIncreaseTo(unlockTime.sub(time.duration.days('5')));

        await st1inch.deposit(ether('30'), 0);
        await checkBalances(addr.address, ether('50'), unlockTime.sub(await time.latest()), st1inch);
    });

    it('call deposit, 1 year lock, compare voting power against expected value', async () => {
        const { st1inch } = await loadFixture(initContracts);
        const origin = await st1inch.origin();
        await st1inch.deposit(ether('1'), time.duration.days('365'));
        assertRoughlyEqualValues(await st1inch.votingPowerOfAt(addr.address, origin), ether('0.17782'), 1e-4);
    });

    it('call deposit, 2 years lock, compare voting power against expected value', async () => {
        const { st1inch } = await loadFixture(initContracts);
        const origin = await st1inch.origin();
        await st1inch.deposit(ether('1'), time.duration.days('730'));
        assertRoughlyEqualValues(await st1inch.votingPowerOfAt(addr.address, origin), ether('0.31622'), 1e-4);
    });

    it('call deposit, 3 years lock, compare voting power against expected value', async () => {
        const { st1inch } = await loadFixture(initContracts);
        const origin = await st1inch.origin();
        await st1inch.deposit(ether('1'), time.duration.days('1095'));
        assertRoughlyEqualValues(await st1inch.votingPowerOfAt(addr.address, origin), ether('0.56234'), 1e-4);
    });

    it('call deposit, 4 years lock, compare voting power against expected value', async () => {
        const { st1inch } = await loadFixture(initContracts);
        const origin = await st1inch.origin();
        await st1inch.deposit(ether('1'), time.duration.days('1460'));
        assertRoughlyEqualValues(await st1inch.votingPowerOfAt(addr.address, origin), ether('1'), 1e-4);
    });

    it('call deposit, 1 year lock, compare voting power against expected value after the lock end', async () => {
        const { st1inch } = await loadFixture(initContracts);
        await st1inch.deposit(ether('1'), time.duration.days('365'));
        const unlockTime = await st1inch.unlockTime(addr.address);
        assertRoughlyEqualValues(await st1inch.votingPowerOfAt(addr.address, unlockTime), ether('0.1'), 1e-4);
    });

    it('call deposit, 2 years lock, compare voting power against expected value after the lock end', async () => {
        const { st1inch } = await loadFixture(initContracts);
        await st1inch.deposit(ether('1'), time.duration.days('730'));
        const unlockTime = await st1inch.unlockTime(addr.address);
        assertRoughlyEqualValues(await st1inch.votingPowerOfAt(addr.address, unlockTime), ether('0.1'), 1e-4);
    });

    it('call deposit, 3 years lock, compare voting power against expected value after the lock end', async () => {
        const { st1inch } = await loadFixture(initContracts);
        await st1inch.deposit(ether('1'), time.duration.days('1095'));
        const unlockTime = await st1inch.unlockTime(addr.address);
        assertRoughlyEqualValues(await st1inch.votingPowerOfAt(addr.address, unlockTime), ether('0.1'), 1e-4);
    });

    it('call deposit, 4 years lock, compare voting power against expected value after the lock end', async () => {
        const { st1inch } = await loadFixture(initContracts);
        await st1inch.deposit(ether('1'), time.duration.days('1460'));
        const unlockTime = await st1inch.unlockTime(addr.address);
        assertRoughlyEqualValues(await st1inch.votingPowerOfAt(addr.address, unlockTime), ether('0.1'), 1e-4);
    });

    it('should increase deposit amount (call increaseAmount)', async () => {
        const { st1inch } = await loadFixture(initContracts);
        await st1inch.deposit(ether('70'), time.duration.days('100'));

        const unlockTime = await st1inch.unlockTime(addr.address);
        await timeIncreaseTo(unlockTime.sub(time.duration.days('50')));

        await st1inch.increaseAmount(ether('20'));
        await checkBalances(addr.address, ether('90'), unlockTime.sub(await time.latest()), st1inch);
    });

    it('should withdraw users deposit', async () => {
        const { oneInch, st1inch } = await loadFixture(initContracts);
        await st1inch.deposit(ether('100'), time.duration.days('50'));

        const unlockTime = await st1inch.unlockTime(addr.address);
        await timeIncreaseTo(unlockTime);
        const balanceaddr = await oneInch.balanceOf(addr.address);

        await st1inch.withdraw();

        expect(await oneInch.balanceOf(addr.address)).to.equal(balanceaddr.add(ether('100')));
        expect(await st1inch.depositsAmount(addr.address)).to.equal(0);
        expect(await st1inch.balanceOf(addr.address)).to.equal(0);
        expect(await st1inch.votingPowerOf(addr.address)).to.equal(0);
    });

    it('should withdraw users deposit and send tokens to other address', async () => {
        const { oneInch, st1inch } = await loadFixture(initContracts);
        await st1inch.deposit(ether('100'), time.duration.days('50'));

        const unlockTime = await st1inch.unlockTime(addr.address);
        await timeIncreaseTo(unlockTime);
        const balanceaddr = await oneInch.balanceOf(addr.address);
        const balanceAddr1 = await oneInch.balanceOf(addr1.address);

        await st1inch.withdrawTo(addr1.address);

        expect(await oneInch.balanceOf(addr.address)).to.equal(balanceaddr);
        expect(await oneInch.balanceOf(addr1.address)).to.equal(balanceAddr1.add(ether('100')));
        expect(await st1inch.depositsAmount(addr.address)).to.equal(0);
        expect(await st1inch.balanceOf(addr.address)).to.equal(0);
        expect(await st1inch.votingPowerOf(addr.address)).to.equal(0);
    });

    it('should not increase time and amount for existing deposit', async () => {
        const { st1inch } = await loadFixture(initContracts);
        await st1inch.deposit(ether('50'), time.duration.days('1'));

        await expect(st1inch.deposit(ether('50'), time.duration.days('1'))).to.be.revertedWithCustomError(
            st1inch,
            'ChangeAmountAndUnlockTimeForExistingAccount',
        );
    });

    it('should not take deposit with lock less then MIN_LOCK_PERIOD', async () => {
        const { st1inch } = await loadFixture(initContracts);
        const MIN_LOCK_PERIOD = await st1inch.MIN_LOCK_PERIOD();
        await expect(st1inch.deposit(ether('50'), MIN_LOCK_PERIOD.sub(1))).to.be.revertedWithCustomError(
            st1inch,
            'LockTimeLessMinLock',
        );
    });

    it('should not take deposit with lock more then MAX_LOCK_PERIOD', async () => {
        const { st1inch } = await loadFixture(initContracts);
        const MAX_LOCK_PERIOD = await st1inch.MAX_LOCK_PERIOD();
        await expect(st1inch.deposit(ether('50'), MAX_LOCK_PERIOD.add(1))).to.be.revertedWithCustomError(
            st1inch,
            'LockTimeMoreMaxLock',
        );
    });

    it('should withdraw before unlock time', async () => {
        const { st1inch } = await loadFixture(initContracts);
        await st1inch.deposit(ether('50'), time.duration.days('1'));

        await expect(st1inch.withdraw()).to.be.revertedWithCustomError(st1inch, 'UnlockTimeWasNotCome');
    });

    it('should emergency withdraw', async () => {
        const { oneInch, st1inch } = await loadFixture(initContracts);
        await st1inch.deposit(ether('50'), time.duration.days('1'));
        const balanceaddr = await oneInch.balanceOf(addr.address);
        expect(await st1inch.emergencyExit()).to.equal(false);

        await st1inch.setEmergencyExit(true);
        await st1inch.withdraw();

        expect(await st1inch.emergencyExit()).to.equal(true);
        expect(await oneInch.balanceOf(addr.address)).to.equal(balanceaddr.add(ether('50')));
    });

    it("shouldn't call setEmergencyExit if caller isn't the owner", async () => {
        const { st1inch } = await loadFixture(initContracts);
        await expect(st1inch.connect(addr1).setEmergencyExit(true)).to.be.revertedWith(
            'Ownable: caller is not the owner',
        );
    });
});
