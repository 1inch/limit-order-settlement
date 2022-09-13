const {
    expect,
    ether,
    toBN,
    assertRoughlyEqualValues,
    timeIncreaseTo,
} = require("@1inch/solidity-utils");
const { time, expectRevert } = require("@openzeppelin/test-helpers");
const { addr0Wallet, addr1Wallet } = require("./helpers/utils");

const TokenMock = artifacts.require("TokenMock");
const St1inch = artifacts.require("St1inch");

describe("St1inch", async () => {
    const [addr0, addr1] = [
        addr0Wallet.getAddressString(),
        addr1Wallet.getAddressString(),
    ];
    const baseExp = toBN("999999981746377019");
    const invertBaseExp = ether("1000000000000000000").div(baseExp);

    const exp = (point, t, base = baseExp) => {
        while (t.gt(toBN("0"))) {
            if (t.and(toBN("1")).eq(toBN("1"))) {
                point = point.mul(base).div(ether("1"));
            }
            base = base.mul(base).div(ether("1"));
            t = t.shrn(1);
        }

        return point;
    };

    const checkBalances = async (account, balance, lockDuration) => {
        expect(
            await this.st1inch.depositsAmount(account)
        ).to.be.bignumber.equal(balance);
        const t = (await time.latest()).add(lockDuration).sub(this.origin);
        const originPower = exp(balance, t, invertBaseExp);
        expect(await this.st1inch.balanceOf(account)).to.be.bignumber.equal(
            originPower
        );
        expect(await this.st1inch.votingPowerOf(account)).to.be.bignumber.equal(
            exp(originPower, (await time.latest()).sub(this.origin))
        );
        assertRoughlyEqualValues(
            await this.st1inch.methods["votingPowerOf(address,uint256)"](
                account,
                await this.st1inch.unlockTime(account)
            ),
            balance,
            1e-10
        );
    };

    beforeEach(async () => {
        this.oneInch = await TokenMock.new("1inch", "1inch");
        await this.oneInch.mint(addr0, ether("100"));
        await this.oneInch.mint(addr1, ether("100"));

        this.st1inch = await St1inch.new(this.oneInch.address, baseExp);
        await this.oneInch.approve(this.st1inch.address, ether("100"));
        await this.oneInch.approve(this.st1inch.address, ether("100"), {
            from: addr1,
        });
        this.origin = await this.st1inch.origin();
    });

    it("should take users deposit", async () => {
        expect(await this.st1inch.depositsAmount(addr0)).to.be.bignumber.equal(
            toBN("0")
        );
        expect(await this.st1inch.balanceOf(addr0)).to.be.bignumber.equal(
            toBN("0")
        );
        expect(await this.st1inch.votingPowerOf(addr0)).to.be.bignumber.equal(
            toBN("0")
        );

        let tx = await this.st1inch.deposit(
            ether("100"),
            time.duration.days("1")
        );
        console.log(tx.receipt.gasUsed);

        await checkBalances(addr0, ether("100"), time.duration.days("1"));
    });

    it("should take users deposit for other account", async () => {
        expect(await this.st1inch.depositsAmount(addr1)).to.be.bignumber.equal(
            toBN("0")
        );
        expect(await this.st1inch.balanceOf(addr1)).to.be.bignumber.equal(
            toBN("0")
        );
        expect(await this.st1inch.votingPowerOf(addr1)).to.be.bignumber.equal(
            toBN("0")
        );
        const balanceAddr0 = await this.oneInch.balanceOf(addr0);
        const balanceAddr1 = await this.oneInch.balanceOf(addr1);

        let tx = await this.st1inch.depositFor(
            addr1,
            ether("100"),
            time.duration.days("1")
        );
        console.log(tx.receipt.gasUsed);

        expect(await this.oneInch.balanceOf(addr0)).to.be.bignumber.equal(
            balanceAddr0.sub(ether("100"))
        );
        expect(await this.oneInch.balanceOf(addr1)).to.be.bignumber.equal(
            balanceAddr1
        );
        await checkBalances(addr1, ether("100"), time.duration.days("1"));
        expect(await this.st1inch.depositsAmount(addr0)).to.be.bignumber.equal(
            toBN("0")
        );
        expect(await this.st1inch.balanceOf(addr0)).to.be.bignumber.equal(
            toBN("0")
        );
        expect(await this.st1inch.votingPowerOf(addr0)).to.be.bignumber.equal(
            toBN("0")
        );
    });

    it("should increase unlock time for deposit (call deposit)", async () => {
        let tx = await this.st1inch.deposit(
            ether("100"),
            time.duration.days("1")
        );
        console.log(tx.receipt.gasUsed);
        await timeIncreaseTo(await this.st1inch.unlockTime(addr0));

        tx = await this.st1inch.deposit(toBN("0"), time.duration.years("2"));

        console.log(tx.receipt.gasUsed);
        await checkBalances(addr0, ether("100"), time.duration.years("2"));
    });

    it("should increase unlock time for deposit (call increaseUnlockTime)", async () => {
        let tx = await this.st1inch.deposit(
            ether("70"),
            time.duration.days("1")
        );
        console.log(tx.receipt.gasUsed);
        await timeIncreaseTo(await this.st1inch.unlockTime(addr0));

        tx = await this.st1inch.increaseUnlockTime(time.duration.days("10"));
        console.log(tx.receipt.gasUsed);

        await checkBalances(addr0, ether("70"), time.duration.days("10"));
    });

    it("should increase deposit amount (call deposit)", async () => {
        let tx = await this.st1inch.deposit(
            ether("20"),
            time.duration.days("10")
        );
        console.log(tx.receipt.gasUsed);

        const unlockTime = await this.st1inch.unlockTime(addr0);
        await timeIncreaseTo(unlockTime.sub(time.duration.days("5")));

        tx = await this.st1inch.deposit(ether("30"), toBN("0"));
        console.log(tx.receipt.gasUsed);

        await checkBalances(
            addr0,
            ether("50"),
            unlockTime.sub(await time.latest())
        );
    });

    it("should increase deposit amount (call increaseAmount)", async () => {
        let tx = await this.st1inch.deposit(
            ether("70"),
            time.duration.days("100")
        );
        console.log(tx.receipt.gasUsed);

        const unlockTime = await this.st1inch.unlockTime(addr0);
        await timeIncreaseTo(unlockTime.sub(time.duration.days("50")));

        tx = await this.st1inch.increaseAmount(ether("20"));
        console.log(tx.receipt.gasUsed);

        await checkBalances(
            addr0,
            ether("90"),
            unlockTime.sub(await time.latest())
        );
    });

    it("should withdraw users deposit", async () => {
        let tx = await this.st1inch.deposit(
            ether("100"),
            time.duration.days("50")
        );
        console.log(tx.receipt.gasUsed);

        const unlockTime = await this.st1inch.unlockTime(addr0);
        await timeIncreaseTo(unlockTime);
        const balanceAddr0 = await this.oneInch.balanceOf(addr0);

        tx = await this.st1inch.withdraw();
        console.log(tx.receipt.gasUsed);

        expect(await this.oneInch.balanceOf(addr0)).to.be.bignumber.equal(
            balanceAddr0.add(ether("100"))
        );
        expect(await this.st1inch.depositsAmount(addr0)).to.be.bignumber.equal(
            toBN("0")
        );
        expect(await this.st1inch.balanceOf(addr0)).to.be.bignumber.equal(
            toBN("0")
        );
        expect(await this.st1inch.votingPowerOf(addr0)).to.be.bignumber.equal(
            toBN("0")
        );
    });

    it("should withdraw users deposit and send tokens to other address", async () => {
        let tx = await this.st1inch.deposit(
            ether("100"),
            time.duration.days("50")
        );
        console.log(tx.receipt.gasUsed);

        const unlockTime = await this.st1inch.unlockTime(addr0);
        await timeIncreaseTo(unlockTime);
        const balanceAddr0 = await this.oneInch.balanceOf(addr0);
        const balanceAddr1 = await this.oneInch.balanceOf(addr1);

        tx = await this.st1inch.withdrawTo(addr1);
        console.log(tx.receipt.gasUsed);

        expect(await this.oneInch.balanceOf(addr0)).to.be.bignumber.equal(
            balanceAddr0
        );
        expect(await this.oneInch.balanceOf(addr1)).to.be.bignumber.equal(
            balanceAddr1.add(ether("100"))
        );
        expect(await this.st1inch.depositsAmount(addr0)).to.be.bignumber.equal(
            toBN("0")
        );
        expect(await this.st1inch.balanceOf(addr0)).to.be.bignumber.equal(
            toBN("0")
        );
        expect(await this.st1inch.votingPowerOf(addr0)).to.be.bignumber.equal(
            toBN("0")
        );
    });

    it("should not increase time and amount for existing deposit", async () => {
        let tx = await this.st1inch.deposit(
            ether("50"),
            time.duration.days("1")
        );
        console.log(tx.receipt.gasUsed);

        await expectRevert(
            this.st1inch.deposit(ether("50"), time.duration.days("1")),
            "ChangeAmountAndUnlockTimeForExistingAccount()"
        );
    });

    it("should not take deposit with lock less then MIN_LOCK_PERIOD", async () => {
        const MIN_LOCK_PERIOD = await this.st1inch.MIN_LOCK_PERIOD();
        await expectRevert(
            this.st1inch.deposit(ether("50"), MIN_LOCK_PERIOD.sub(toBN("1"))),
            "LockTimeLessMinLock()"
        );
    });

    it("should not take deposit with lock more then MAX_LOCK_PERIOD", async () => {
        const MAX_LOCK_PERIOD = await this.st1inch.MAX_LOCK_PERIOD();
        await expectRevert(
            this.st1inch.deposit(ether("50"), MAX_LOCK_PERIOD.add(toBN("1"))),
            "LockTimeMoreMaxLock()"
        );
    });

    it("should withdraw before unlock time", async () => {
        let tx = await this.st1inch.deposit(
            ether("50"),
            time.duration.days("1")
        );
        console.log(tx.receipt.gasUsed);

        await expectRevert(this.st1inch.withdraw(), "UnlockTimeWasNotCome()");
    });
});
