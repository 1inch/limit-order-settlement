const { expect, assertRoughlyEqualValues, timeIncreaseTo, time, getPermit, ether } = require('@1inch/solidity-utils');
const { BigNumber: BN } = require('ethers');
const { ethers } = require('hardhat');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { getChainId } = require('./helpers/fixtures');
const { expBase } = require('./helpers/utils');
const { shouldBehaveLikeERC20Pods } = require('@1inch/erc20-pods/test/behaviors/ERC20Pods.behavior.js');

describe('St1inch', function () {
    let addr, addr1;
    const votingPowerDivider = 20n;
    const maxPods = 5;
    let chainId;

    const exp = (point, t) => {
        let base = expBase;
        while (t > 0n) {
            if ((t & 1n) === 1n) {
                point = point * base / ether('1');
            }
            base = base * base / ether('1');
            t = t >> 1n;
        }
        return point;
    };

    const expInv = (point, t) => {
        let base = expBase;
        while (t > 0n) {
            if ((t & 1n) === 1n) {
                point = point * ether('1') / base;
            }
            base = base * base / ether('1');
            t = t >> 1n;
        }
        return point;
    };

    const checkBalances = async (account, balance, lockDuration, st1inch) => {
        const origin = await st1inch.origin();
        expect((await st1inch.depositors(account)).amount).to.equal(balance);
        const t = BN.from(await time.latest()).add(lockDuration).sub(origin).toBigInt();
        const originPower = expInv(balance, t) / votingPowerDivider;
        expect(await st1inch.balanceOf(account)).to.equal(originPower);
        expect(await st1inch.votingPowerOf(account)).to.equal(
            exp(originPower, BN.from(await time.latest()).sub(origin).toBigInt()),
        );
        assertRoughlyEqualValues(
            await st1inch.votingPowerOfAt(account, (await st1inch.depositors(account)).unlockTime),
            balance / votingPowerDivider,
            1e-10,
        );
    };

    async function deployInch() {
        const TokenPermitMock = await ethers.getContractFactory('ERC20PermitMock');
        const oneInch = await TokenPermitMock.deploy('1inch', '1inch', addr.address, ether('200'));
        await oneInch.deployed();

        return { oneInch };
    }

    async function initContracts() {
        const { oneInch } = await deployInch();

        const St1inch = await ethers.getContractFactory('St1inch');
        const st1inch = await St1inch.deploy(oneInch.address, expBase, addr.address);
        await st1inch.deployed();

        await oneInch.transfer(addr1.address, ether('100'));
        await oneInch.approve(st1inch.address, ether('100'));
        await oneInch.connect(addr1).approve(st1inch.address, ether('100'));

        await st1inch.setMaxLossRatio('100000000'); // 10%

        return { oneInch, st1inch };
    }

    async function initContractsBehavior() {
        const { oneInch } = await deployInch();

        const St1inch = await ethers.getContractFactory('St1inchMock');
        const st1inch = await St1inch.deploy(oneInch.address, expBase, addr.address);
        await st1inch.deployed();

        const PodMock = await ethers.getContractFactory('PodMock');
        const pods = [];
        for (let i = 0; i < maxPods; i++) {
            pods[i] = await PodMock.deploy(`POD_TOKEN_${i}`, `PT${i}`, st1inch.address);
            await pods[i].deployed();
        }
        const amount = ether('1');
        const erc20Pods = st1inch;
        return { erc20Pods, pods, amount };
    }

    before(async function () {
        [addr, addr1] = await ethers.getSigners();
        chainId = await getChainId();
    });

    shouldBehaveLikeERC20Pods(initContractsBehavior);

    it('should take users deposit', async function () {
        const { st1inch } = await loadFixture(initContracts);

        expect((await st1inch.depositors(addr.address)).amount).to.equal(0);
        expect(await st1inch.balanceOf(addr.address)).to.equal(0);
        expect(await st1inch.votingPowerOf(addr.address)).to.equal(0);

        await st1inch.deposit(ether('100'), time.duration.days('30'));

        await checkBalances(addr.address, ether('100'), time.duration.days('30'), st1inch);
    });

    it('should take users deposit with permit', async function () {
        const { oneInch, st1inch } = await loadFixture(initContracts);

        expect((await st1inch.depositors(addr.address)).amount).to.equal(0);
        expect(await st1inch.balanceOf(addr.address)).to.equal(0);
        expect(await st1inch.votingPowerOf(addr.address)).to.equal(0);
        await oneInch.approve(st1inch.address, '0');
        const permit = await getPermit(addr, oneInch, '1', chainId, st1inch.address, ether('100'));

        await st1inch.depositWithPermit(ether('100'), time.duration.days('30'), permit);

        await checkBalances(addr.address, ether('100'), time.duration.days('30'), st1inch);
    });

    it('should take users deposit for other account', async function () {
        const { oneInch, st1inch } = await loadFixture(initContracts);

        expect((await st1inch.depositors(addr1.address)).amount).to.equal(0);
        expect(await st1inch.balanceOf(addr1.address)).to.equal(0);
        expect(await st1inch.votingPowerOf(addr1.address)).to.equal(0);
        const balanceaddr = await oneInch.balanceOf(addr.address);
        const balanceAddr1 = await oneInch.balanceOf(addr1.address);

        await st1inch.connect(addr1).deposit(0, time.duration.days('30') + 1);
        await st1inch.depositFor(addr1.address, ether('100'));

        expect(await oneInch.balanceOf(addr.address)).to.equal(balanceaddr.sub(ether('100')));
        expect(await oneInch.balanceOf(addr1.address)).to.equal(balanceAddr1);
        await checkBalances(addr1.address, ether('100'), time.duration.days('30'), st1inch);
        expect((await st1inch.depositors(addr.address)).amount).to.equal(0);
        expect(await st1inch.balanceOf(addr.address)).to.equal(0);
        expect(await st1inch.votingPowerOf(addr.address)).to.equal(0);
    });

    it('should take users deposit with permit for other account', async function () {
        const { oneInch, st1inch } = await loadFixture(initContracts);

        expect((await st1inch.depositors(addr1.address)).amount).to.equal(0);
        expect(await st1inch.balanceOf(addr1.address)).to.equal(0);
        expect(await st1inch.votingPowerOf(addr1.address)).to.equal(0);
        const balanceaddr = await oneInch.balanceOf(addr.address);
        const balanceAddr1 = await oneInch.balanceOf(addr1.address);
        await oneInch.approve(st1inch.address, '0');
        const permit = await getPermit(addr, oneInch, '1', chainId, st1inch.address, ether('100'));

        await st1inch.connect(addr1).deposit(0, time.duration.days('30') + 1);
        await st1inch.depositForWithPermit(addr1.address, ether('100'), permit);

        expect(await oneInch.balanceOf(addr.address)).to.equal(balanceaddr.sub(ether('100')));
        expect(await oneInch.balanceOf(addr1.address)).to.equal(balanceAddr1);
        await checkBalances(addr1.address, ether('100'), time.duration.days('30'), st1inch);
        expect((await st1inch.depositors(addr.address)).amount).to.equal(0);
        expect(await st1inch.balanceOf(addr.address)).to.equal(0);
        expect(await st1inch.votingPowerOf(addr.address)).to.equal(0);
    });

    it('should increase unlock time for deposit (call deposit)', async function () {
        const { st1inch } = await loadFixture(initContracts);
        await st1inch.deposit(ether('100'), time.duration.days('30'));
        await timeIncreaseTo((await st1inch.depositors(addr.address)).unlockTime);

        await st1inch.deposit(0, time.duration.years('2'));
        await checkBalances(addr.address, ether('100'), time.duration.years('2'), st1inch);
    });

    it('should decrease unlock time with early withdraw', async function () {
        const { oneInch, st1inch } = await loadFixture(initContracts);
        await st1inch.setMaxLossRatio('1000000000'); // 100%
        await st1inch.setFeeReceiver(addr.address);

        await st1inch.deposit(ether('100'), time.duration.days('60'));
        await timeIncreaseTo(await time.latest() + time.duration.days('5'));

        await st1inch.earlyWithdrawTo(addr.address, ether('0'), ether('100'));
        expect((await st1inch.depositors(addr.address)).unlockTime).to.equal(await time.latest());
        await oneInch.approve(st1inch.address, ether('100'));

        await st1inch.deposit(ether('100'), time.duration.days('30'));

        await checkBalances(addr.address, ether('100'), time.duration.days('30'), st1inch);
    });

    it('should increase unlock time for deposit (call deposit(0,*))', async function () {
        const { st1inch } = await loadFixture(initContracts);
        await st1inch.deposit(ether('70'), time.duration.days('30'));
        await timeIncreaseTo((await st1inch.depositors(addr.address)).unlockTime);

        await st1inch.deposit(0, time.duration.days('40'));
        await checkBalances(addr.address, ether('70'), time.duration.days('40'), st1inch);
    });

    it('should increase deposit amount (call deposit)', async function () {
        const { st1inch } = await loadFixture(initContracts);
        await st1inch.deposit(ether('20'), time.duration.days('50'));

        const unlockTime = (await st1inch.depositors(addr.address)).unlockTime;
        await timeIncreaseTo(unlockTime - time.duration.days('45'));

        await st1inch.deposit(ether('30'), 0);
        await checkBalances(addr.address, ether('50'), unlockTime - (await time.latest()), st1inch);
    });

    it('call deposit, 1 year lock, compare voting power against expected value', async function () {
        const { st1inch } = await loadFixture(initContracts);
        const origin = await st1inch.origin();
        await st1inch.deposit(ether('1'), time.duration.days('365'));
        assertRoughlyEqualValues(await st1inch.votingPowerOfAt(addr.address, origin), ether('0.22360'), 1e-4);
    });

    it('call deposit, 2 years lock, compare voting power against expected value', async function () {
        const { st1inch } = await loadFixture(initContracts);
        const origin = await st1inch.origin();
        await st1inch.deposit(ether('1'), time.duration.days('730'));
        assertRoughlyEqualValues(await st1inch.votingPowerOfAt(addr.address, origin), ether('1'), 1e-4);
    });

    it('call deposit, 1 year lock, compare voting power against expected value after the lock end', async function () {
        const { st1inch } = await loadFixture(initContracts);
        await st1inch.deposit(ether('1'), time.duration.days('365'));
        const unlockTime = (await st1inch.depositors(addr.address)).unlockTime;
        assertRoughlyEqualValues(await st1inch.votingPowerOfAt(addr.address, unlockTime), ether('0.05'), 1e-4);
    });

    it('call deposit, 2 years lock, compare voting power against expected value after the lock end', async function () {
        const { st1inch } = await loadFixture(initContracts);
        await st1inch.deposit(ether('1'), time.duration.days('730'));
        const unlockTime = (await st1inch.depositors(addr.address)).unlockTime;
        assertRoughlyEqualValues(await st1inch.votingPowerOfAt(addr.address, unlockTime), ether('0.05'), 1e-4);
    });

    it('should increase deposit amount (call deposit(*,0))', async function () {
        const { st1inch } = await loadFixture(initContracts);
        await st1inch.deposit(ether('70'), time.duration.days('100'));

        const unlockTime = (await st1inch.depositors(addr.address)).unlockTime;
        await timeIncreaseTo(unlockTime - time.duration.days('50'));

        await st1inch.deposit(ether('20'), 0);
        await checkBalances(addr.address, ether('90'), unlockTime - (await time.latest()), st1inch);
    });

    it('should withdraw users deposit', async function () {
        const { oneInch, st1inch } = await loadFixture(initContracts);
        await st1inch.deposit(ether('100'), time.duration.days('50'));

        const unlockTime = (await st1inch.depositors(addr.address)).unlockTime;
        await timeIncreaseTo(unlockTime);
        const balanceaddr = await oneInch.balanceOf(addr.address);

        await st1inch.withdraw();

        expect(await oneInch.balanceOf(addr.address)).to.equal(balanceaddr.add(ether('100')));
        expect((await st1inch.depositors(addr.address)).amount).to.equal(0);
        expect(await st1inch.balanceOf(addr.address)).to.equal(0);
        expect(await st1inch.votingPowerOf(addr.address)).to.equal(0);
    });

    it('should store unlock time after withdraw', async function () {
        const { st1inch } = await loadFixture(initContracts);
        await st1inch.deposit(ether('100'), time.duration.days('50'));

        const unlockTime = (await st1inch.depositors(addr.address)).unlockTime;
        await timeIncreaseTo(unlockTime);

        await st1inch.withdraw();

        expect((await st1inch.depositors(addr.address)).unlockTime).to.equal(await time.latest());
    });

    it('should withdraw users deposit and send tokens to other address', async function () {
        const { oneInch, st1inch } = await loadFixture(initContracts);
        await st1inch.deposit(ether('100'), time.duration.days('50'));

        const unlockTime = (await st1inch.depositors(addr.address)).unlockTime;
        await timeIncreaseTo(unlockTime);
        const balanceaddr = await oneInch.balanceOf(addr.address);
        const balanceAddr1 = await oneInch.balanceOf(addr1.address);

        await st1inch.withdrawTo(addr1.address);

        expect(await oneInch.balanceOf(addr.address)).to.equal(balanceaddr);
        expect(await oneInch.balanceOf(addr1.address)).to.equal(balanceAddr1.add(ether('100')));
        expect((await st1inch.depositors(addr.address)).amount).to.equal(0);
        expect(await st1inch.balanceOf(addr.address)).to.equal(0);
        expect(await st1inch.votingPowerOf(addr.address)).to.equal(0);
    });

    it('should not take deposit with lock less then MIN_LOCK_PERIOD', async function () {
        const { st1inch } = await loadFixture(initContracts);
        const MIN_LOCK_PERIOD = await st1inch.MIN_LOCK_PERIOD();
        await expect(st1inch.deposit(ether('50'), MIN_LOCK_PERIOD.sub(1))).to.be.revertedWithCustomError(
            st1inch,
            'LockTimeLessMinLock',
        );
    });

    it('should not take deposit with lock more then MAX_LOCK_PERIOD', async function () {
        const { st1inch } = await loadFixture(initContracts);
        const MAX_LOCK_PERIOD = await st1inch.MAX_LOCK_PERIOD();
        await expect(st1inch.deposit(ether('50'), MAX_LOCK_PERIOD.add(1))).to.be.revertedWithCustomError(
            st1inch,
            'LockTimeMoreMaxLock',
        );
    });

    it('should withdraw before unlock time', async function () {
        const { st1inch } = await loadFixture(initContracts);
        await st1inch.deposit(ether('50'), time.duration.days('30'));

        await expect(st1inch.withdraw()).to.be.revertedWithCustomError(st1inch, 'UnlockTimeHasNotCome');
    });

    it('should emergency withdraw', async function () {
        const { oneInch, st1inch } = await loadFixture(initContracts);
        await st1inch.deposit(ether('50'), time.duration.days('30'));
        const balanceaddr = await oneInch.balanceOf(addr.address);
        expect(await st1inch.emergencyExit()).to.equal(false);

        await st1inch.setEmergencyExit(true);
        await st1inch.withdraw();

        expect(await st1inch.emergencyExit()).to.equal(true);
        expect(await oneInch.balanceOf(addr.address)).to.equal(balanceaddr.add(ether('50')));
    });

    it("shouldn't call setEmergencyExit if caller isn't the owner", async function () {
        const { st1inch } = await loadFixture(initContracts);
        await expect(st1inch.connect(addr1).setEmergencyExit(true)).to.be.revertedWith(
            'Ownable: caller is not the owner',
        );
    });

    describe('earlyWithdrawTo', async function () {
        it('should not work after unlockTime', async function () {
            const { st1inch } = await loadFixture(initContracts);
            const lockTime = time.duration.years('1');
            await st1inch.deposit(ether('1'), lockTime);
            await timeIncreaseTo(BigInt(await time.latest()) + BigInt(lockTime));
            await expect(st1inch.earlyWithdrawTo(addr.address, '1', '1')).to.be.revertedWithCustomError(
                st1inch,
                'StakeUnlocked',
            );
        });

        it('should not work when emergencyExit is setted', async function () {
            const { st1inch } = await loadFixture(initContracts);
            await st1inch.deposit(ether('1'), time.duration.years('1'));
            await st1inch.setEmergencyExit(true);
            await expect(st1inch.earlyWithdrawTo(addr.address, '1', '1')).to.be.revertedWithCustomError(
                st1inch,
                'StakeUnlocked',
            );
        });

        it('should not work when minReturn is not met', async function () {
            const { st1inch } = await loadFixture(initContracts);
            await st1inch.deposit(ether('1'), time.duration.years('1'));
            await expect(st1inch.earlyWithdrawTo(addr.address, ether('1'), '1')).to.be.revertedWithCustomError(
                st1inch,
                'MinReturnIsNotMet',
            );
        });

        it('should not work when maxLoss is not met', async function () {
            const { st1inch } = await loadFixture(initContracts);
            await st1inch.deposit(ether('1'), time.duration.years('1'));
            await expect(st1inch.earlyWithdrawTo(addr.address, '1', '1')).to.be.revertedWithCustomError(
                st1inch,
                'MaxLossIsNotMet',
            );
        });

        it('should not work when loss is too big', async function () {
            const { st1inch } = await loadFixture(initContracts);
            await st1inch.deposit(ether('1'), time.duration.years('2'));
            await expect(st1inch.earlyWithdrawTo(addr.address, '1', ether('1'))).to.be.revertedWithCustomError(
                st1inch,
                'LossIsTooBig',
            );
        });

        it('should withdrawal with loss', async function () {
            const { oneInch, st1inch } = await loadFixture(initContracts);
            const lockTime = time.duration.years('1');
            await st1inch.deposit(ether('1'), lockTime);
            await timeIncreaseTo(BigInt(await time.latest()) + BigInt(lockTime) / 2n);
            await st1inch.setFeeReceiver(addr1.address);

            const amount = BigInt((await st1inch.depositors(addr.address)).amount);
            const vp = BigInt(await st1inch.votingPower(await st1inch.balanceOf(addr.address)));
            const ret = (amount - vp) * 100n / 95n;
            const loss = amount - ret;

            const balanceAddrBefore = BigInt(await oneInch.balanceOf(addr.address));
            const balanceAddr1Before = BigInt(await oneInch.balanceOf(addr1.address));
            await st1inch.earlyWithdrawTo(addr.address, '1', ether('0.2'));
            expect(await oneInch.balanceOf(addr1.address)).to.lt(balanceAddr1Before + loss);
            expect(await oneInch.balanceOf(addr.address)).to.gt(balanceAddrBefore + ether('1') - loss);
        });

        it('should decrease loss with time', async function () {
            const { st1inch } = await loadFixture(initContracts);
            const lockTime = time.duration.years('2');
            const tx = await st1inch.deposit(ether('1'), lockTime);
            const stakedTime = BigInt((await ethers.provider.getBlock(tx.blockNumber)).timestamp);

            const rest2YearsLoss = (await st1inch.earlyWithdrawLoss(addr.address)).loss;
            const rest2YearsVotingPower = await st1inch.votingPowerOf(addr.address);
            console.log('rest2YearsLoss', rest2YearsLoss.toString());
            console.log('rest2YearsVP', rest2YearsVotingPower.toString());

            await timeIncreaseTo(stakedTime + BigInt(time.duration.years('0.5')));
            const rest1HalfYearsLoss = (await st1inch.earlyWithdrawLoss(addr.address)).loss;
            const rest1HalfYearsVotingPower = await st1inch.votingPowerOf(addr.address);
            console.log('rest1.5YearsLoss', rest1HalfYearsLoss.toString());
            console.log('rest1.5YearsVP', rest1HalfYearsVotingPower.toString());

            await timeIncreaseTo(stakedTime + BigInt(time.duration.years('1')));
            const rest1YearsLoss = (await st1inch.earlyWithdrawLoss(addr.address)).loss;
            const rest1YearsVotingPower = await st1inch.votingPowerOf(addr.address);
            console.log('rest1YearsLoss', rest1YearsLoss.toString());
            console.log('rest1YearsVP', rest1YearsVotingPower.toString());

            await timeIncreaseTo(stakedTime + BigInt(time.duration.years('1.5')));
            const restHalfYearsLoss = (await st1inch.earlyWithdrawLoss(addr.address)).loss;
            const restHalfYearsVotingPower = await st1inch.votingPowerOf(addr.address);
            console.log('restHalfYearsLoss', restHalfYearsLoss.toString());
            console.log('restHalfYearsVP', restHalfYearsVotingPower.toString());

            await timeIncreaseTo(stakedTime + BigInt(time.duration.years('1') + time.duration.weeks('48')));
            const restMonthLoss = (await st1inch.earlyWithdrawLoss(addr.address)).loss;
            const restMonthVotingPower = await st1inch.votingPowerOf(addr.address);
            console.log('restMonthLoss', restMonthLoss.toString());
            console.log('restMonthVP', restMonthVotingPower.toString());

            await timeIncreaseTo(stakedTime + BigInt(time.duration.years('1') + time.duration.weeks('51')));
            const restWeekLoss = (await st1inch.earlyWithdrawLoss(addr.address)).loss;
            const restWeekVotingPower = await st1inch.votingPowerOf(addr.address);
            console.log('restWeekLoss', restWeekLoss.toString());
            console.log('restWeekVP', restWeekVotingPower.toString());

            await timeIncreaseTo(stakedTime + BigInt(time.duration.years('1') + time.duration.days('364')));
            const restDayLoss = (await st1inch.earlyWithdrawLoss(addr.address)).loss;
            const restDayVotingPower = await st1inch.votingPowerOf(addr.address);
            console.log('restDayLoss', restDayLoss.toString());
            console.log('restDayVP', restDayVotingPower.toString());

            expect(rest2YearsLoss).to.gt(rest1YearsLoss);
            expect(rest1YearsLoss).to.gt(restHalfYearsLoss);
            expect(restHalfYearsLoss).to.gt(restMonthLoss);
            expect(restMonthLoss).to.gt(restWeekLoss);
            expect(restWeekLoss).to.gt(restDayLoss);
        });
    });
});
