const { expect, ether, getPermit, deployContract, constants } = require('@1inch/solidity-utils');
const { ethers } = require('hardhat');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { PANIC_CODES } = require('@nomicfoundation/hardhat-chai-matchers/panic');
const { deploySwapTokens, getChainId } = require('./helpers/fixtures');

describe('FeeBank', function () {
    async function initContracts() {
        const chainId = await getChainId();
        const [owner, alice] = await ethers.getSigners();

        const inch = await deployContract('ERC20PermitMock', ['1INCH', '1INCH', owner, ether('1000')]);
        const { lopv4 } = await deploySwapTokens();
        const matcher = await deployContract('SettlementMock', [lopv4, inch, constants.ZERO_ADDRESS, constants.ZERO_ADDRESS]);

        const FeeBank = await ethers.getContractFactory('FeeBank');
        const feeBank = FeeBank.attach(await matcher.FEE_BANK());

        await inch.transfer(alice, ether('100'));
        await inch.approve(feeBank, ether('1000'));
        await inch.connect(alice).approve(feeBank, ether('1000'));

        return {
            contracts: { inch, feeBank, matcher },
            accounts: { owner, alice },
            others: { chainId },
        };
    }

    describe('deposits', function () {
        it('should increase accountDeposits and availableCredit with deposit()', async function () {
            const { contracts: { inch, feeBank }, accounts: { owner, alice } } = await loadFixture(initContracts);
            const ownerAmount = ether('1');
            const aliceAmount = ether('10');
            const ownerBalanceBefore = await inch.balanceOf(owner);
            const aliceBalanceBefore = await inch.balanceOf(alice);

            await feeBank.deposit(ownerAmount);
            await feeBank.connect(alice).deposit(aliceAmount);

            expect(await feeBank.availableCredit(owner)).to.equal(ownerAmount);
            expect(await feeBank.availableCredit(alice)).to.equal(aliceAmount);
            expect(await inch.balanceOf(owner)).to.equal(ownerBalanceBefore - ownerAmount);
            expect(await inch.balanceOf(alice)).to.equal(aliceBalanceBefore - aliceAmount);
        });

        it('should increase accountDeposits and availableCredit with depositFor()', async function () {
            const { contracts: { inch, feeBank }, accounts: { owner, alice } } = await loadFixture(initContracts);
            const ownerAmount = ether('1');
            const aliceAmount = ether('10');
            const ownerBalanceBefore = await inch.balanceOf(owner);
            const aliceBalanceBefore = await inch.balanceOf(alice);

            await feeBank.connect(alice).depositFor(owner, ownerAmount);
            await feeBank.depositFor(alice, aliceAmount);

            expect(await feeBank.availableCredit(owner)).to.equal(ownerAmount);
            expect(await feeBank.availableCredit(alice)).to.equal(aliceAmount);
            expect(await inch.balanceOf(owner)).to.equal(ownerBalanceBefore - aliceAmount);
            expect(await inch.balanceOf(alice)).to.equal(aliceBalanceBefore - ownerAmount);
        });

        it('should increase accountDeposits and availableCredit without approve with depositWithPermit()', async function () {
            const { contracts: { inch, feeBank }, accounts: { owner }, others: { chainId } } = await loadFixture(initContracts);
            const ownerAmount = ether('1');
            await inch.approve(feeBank, '0');
            const permit = await getPermit(owner, inch, '1', chainId, await feeBank.getAddress(), ownerAmount);
            const ownerBalanceBefore = await inch.balanceOf(owner);

            await feeBank.depositWithPermit(ownerAmount, permit);

            expect(await feeBank.availableCredit(owner)).to.equal(ownerAmount);
            expect(await inch.balanceOf(owner)).to.equal(ownerBalanceBefore - ownerAmount);
        });

        it('should increase accountDeposits and availableCredit without approve with depositForWithPermit()', async function () {
            const { contracts: { inch, feeBank }, accounts: { owner, alice }, others: { chainId } } = await loadFixture(initContracts);
            const ownerAmount = ether('1');
            await inch.approve(feeBank, '0');
            const permit = await getPermit(owner, inch, '1', chainId, await feeBank.getAddress(), ownerAmount);
            const ownerBalanceBefore = await inch.balanceOf(owner);

            await feeBank.depositForWithPermit(alice, ownerAmount, permit);

            expect(await feeBank.availableCredit(alice)).to.equal(ownerAmount);
            expect(await inch.balanceOf(owner)).to.equal(ownerBalanceBefore - ownerAmount);
        });
    });

    describe('withdrawals', function () {
        async function initContratsAndDeposit() {
            const data = await initContracts();
            const { contracts: { feeBank } } = data;
            const totalDepositAmount = ether('100');
            await feeBank.deposit(totalDepositAmount);
            return { ...data, others: { ...data.others, totalDepositAmount } };
        }

        it('should decrease accountDeposits and availableCredit with withdraw()', async function () {
            const { contracts: { inch, feeBank }, accounts: { owner }, others: { totalDepositAmount } } = await loadFixture(initContratsAndDeposit);
            const amount = ether('10');
            const ownerBalanceBefore = await inch.balanceOf(owner);

            await feeBank.withdraw(amount);

            expect(await feeBank.availableCredit(owner)).to.equal(totalDepositAmount - amount);
            expect(await inch.balanceOf(owner)).to.equal(ownerBalanceBefore + amount);
        });

        it('should decrease accountDeposits and availableCredit with withdrawTo()', async function () {
            const { contracts: { inch, feeBank }, accounts: { owner, alice }, others: { totalDepositAmount } } = await loadFixture(initContratsAndDeposit);
            const amount = ether('10');
            const aliceBalanceBefore = await inch.balanceOf(alice);

            await feeBank.withdrawTo(alice, amount);

            expect(await feeBank.availableCredit(owner)).to.equal(totalDepositAmount - amount);
            expect(await inch.balanceOf(alice)).to.equal(aliceBalanceBefore + amount);
        });

        it('should not withdrawal more than account have', async function () {
            const { contracts: { feeBank }, others: { totalDepositAmount } } = await loadFixture(initContratsAndDeposit);
            await expect(feeBank.withdraw(totalDepositAmount + 1n)).to.be.revertedWithPanic(PANIC_CODES.UNDERFLOW);
        });
    });

    describe('gatherFees', function () {
        it('should correct withdrawal fee for 1 account', async function () {
            const { contracts: { inch, feeBank, matcher }, accounts: { owner, alice } } = await loadFixture(initContracts);
            const amount = ether('10');
            const subCreditAmount = ether('2');
            await feeBank.connect(alice).deposit(amount);
            await matcher.decreaseAvailableCreditMock(alice, subCreditAmount);

            const balanceBefore = await inch.balanceOf(owner);
            expect(await feeBank.availableCredit(alice)).to.equal(amount - subCreditAmount);
            await feeBank.gatherFees([alice]);

            expect(await feeBank.availableCredit(alice)).to.equal(amount - subCreditAmount);
            expect(await inch.balanceOf(owner)).to.equal(balanceBefore + subCreditAmount);
        });

        it('should correct withdrawal fee for 2 account', async function () {
            const { contracts: { inch, feeBank, matcher }, accounts: { owner, alice } } = await loadFixture(initContracts);
            const ownerAmount = ether('10');
            const aliceAmount = ether('25');
            const subCreditownerAmount = ether('2');
            const subCreditaliceAmount = ether('11');
            await feeBank.deposit(ownerAmount);
            await feeBank.connect(alice).deposit(aliceAmount);
            await matcher.decreaseAvailableCreditMock(owner, subCreditownerAmount);
            await matcher.decreaseAvailableCreditMock(alice, subCreditaliceAmount);

            const balanceBefore = await inch.balanceOf(owner);
            expect(await feeBank.availableCredit(owner)).to.equal(ownerAmount - subCreditownerAmount);
            expect(await feeBank.availableCredit(alice)).to.equal(aliceAmount - subCreditaliceAmount);
            await feeBank.gatherFees([await owner.getAddress(), await alice.getAddress()]);

            expect(await feeBank.availableCredit(owner)).to.equal(ownerAmount - subCreditownerAmount);
            expect(await feeBank.availableCredit(alice)).to.equal(aliceAmount - subCreditaliceAmount);
            expect(await inch.balanceOf(owner)).to.equal(
                balanceBefore + subCreditownerAmount + subCreditaliceAmount,
            );
        });

        it('should correct withdrawal fee for several account', async function () {
            const { contracts: { inch, feeBank, matcher }, accounts: { owner } } = await loadFixture(initContracts);
            const accounts = [];
            const wallets = await ethers.getSigners();
            for (const wallet of wallets) {
                accounts.push(wallet.address);
            }
            const amounts = [];
            const subCreditAmounts = [];
            let totalSubCreditAmounts = ether('0');
            for (let i = 1; i < accounts.length; i++) {
                amounts[i] = BigInt('0x' + Array.from(ethers.randomBytes(8)).map(b => b.toString(16).padStart(2, '0')).join(''));
                subCreditAmounts[i] = BigInt('0x' + Array.from(ethers.randomBytes(2)).map(b => b.toString(16).padStart(2, '0')).join(''));
                totalSubCreditAmounts = totalSubCreditAmounts + subCreditAmounts[i];
                await feeBank.depositFor(accounts[i], amounts[i]);
            }
            for (let i = 1; i < accounts.length; i++) {
                await matcher.decreaseAvailableCreditMock(accounts[i], subCreditAmounts[i]);
            }

            const balanceBefore = await inch.balanceOf(owner.address);
            for (let i = 1; i < accounts.length; i++) {
                expect(await feeBank.availableCredit(accounts[i])).to.equal(amounts[i] - subCreditAmounts[i]);
            }

            await feeBank.gatherFees(accounts);
            for (let i = 1; i < accounts.length; i++) {
                expect(await feeBank.availableCredit(accounts[i])).to.equal(amounts[i] - subCreditAmounts[i]);
            }
            expect(await inch.balanceOf(owner.address)).to.equal(balanceBefore + totalSubCreditAmounts);
        });

        it('should not work by non-owner', async function () {
            const { contracts: { feeBank }, accounts: { owner, alice } } = await loadFixture(initContracts);
            await expect(feeBank.connect(alice).gatherFees([owner.address, alice.address])).to.be.revertedWithCustomError(
                feeBank, 'OwnableUnauthorizedAccount',
            );
        });
    });
});
