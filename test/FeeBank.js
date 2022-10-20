const { expect } = require('@1inch/solidity-utils');
const { ethers } = require('hardhat');
const { getPermit } = require('@1inch/solidity-utils');
const { BigNumber: BN } = require('ethers');
const { ether } = require('./helpers/orderUtils');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { PANIC_CODES } = require('@nomicfoundation/hardhat-chai-matchers/panic');
const { deploySwapTokens, deploySimpleRegistry, getChainId } = require('./helpers/fixtures');

describe('FeeBank', async () => {
    let addr, addr1;
    let chainId;
    let whitelistRegistrySimple;

    before(async () => {
        [addr, addr1] = await ethers.getSigners();
        chainId = await getChainId();
        whitelistRegistrySimple = await deploySimpleRegistry();
    });

    async function initContracts() {
        const TokenPermitMock = await ethers.getContractFactory('ERC20PermitMock');
        const inch = await TokenPermitMock.deploy('1INCH', '1INCH', addr.address, ether('1000'));
        await inch.deployed();
        const { swap } = await deploySwapTokens();
        const Settlement = await ethers.getContractFactory('Settlement');
        const matcher = await Settlement.deploy(whitelistRegistrySimple.address, swap.address);
        await matcher.deployed();

        const FeeBank = await ethers.getContractFactory('FeeBank');
        const feeBank = await FeeBank.deploy(matcher.address, inch.address);
        await feeBank.deployed();

        await matcher.setFeeBank(feeBank.address);
        await inch.transfer(addr1.address, ether('100'));
        await inch.approve(feeBank.address, ether('1000'));
        await inch.connect(addr1).approve(feeBank.address, ether('1000'));

        return { inch, feeBank, matcher };
    }

    describe('deposits', async () => {
        it('should increase accountDeposits and creditAllowance with deposit()', async () => {
            const { inch, feeBank, matcher } = await loadFixture(initContracts);
            const addrAmount = ether('1');
            const addr1Amount = ether('10');
            const addrbalanceBefore = await inch.balanceOf(addr.address);
            const addr1balanceBefore = await inch.balanceOf(addr1.address);

            await feeBank.deposit(addrAmount);
            await feeBank.connect(addr1).deposit(addr1Amount);

            expect(await feeBank.accountDeposits(addr.address)).to.equal(addrAmount);
            expect(await feeBank.accountDeposits(addr1.address)).to.equal(addr1Amount);
            expect(await matcher.creditAllowance(addr.address)).to.equal(addrAmount);
            expect(await matcher.creditAllowance(addr1.address)).to.equal(addr1Amount);
            expect(await inch.balanceOf(addr.address)).to.equal(addrbalanceBefore.sub(addrAmount));
            expect(await inch.balanceOf(addr1.address)).to.equal(addr1balanceBefore.sub(addr1Amount));
        });

        it('should increase accountDeposits and creditAllowance with depositFor()', async () => {
            const { inch, feeBank, matcher } = await loadFixture(initContracts);
            const addrAmount = ether('1');
            const addr1Amount = ether('10');
            const addrbalanceBefore = await inch.balanceOf(addr.address);
            const addr1balanceBefore = await inch.balanceOf(addr1.address);

            await feeBank.connect(addr1).depositFor(addr.address, addrAmount);
            await feeBank.depositFor(addr1.address, addr1Amount);

            expect(await feeBank.accountDeposits(addr.address)).to.equal(addrAmount);
            expect(await feeBank.accountDeposits(addr1.address)).to.equal(addr1Amount);
            expect(await matcher.creditAllowance(addr.address)).to.equal(addrAmount);
            expect(await matcher.creditAllowance(addr1.address)).to.equal(addr1Amount);
            expect(await inch.balanceOf(addr.address)).to.equal(addrbalanceBefore.sub(addr1Amount));
            expect(await inch.balanceOf(addr1.address)).to.equal(addr1balanceBefore.sub(addrAmount));
        });

        it('should increase accountDeposits and creditAllowance without approve with depositWithPermit()', async () => {
            const { inch, feeBank, matcher } = await loadFixture(initContracts);
            const addrAmount = ether('1');
            await inch.approve(feeBank.address, '0');
            const permit = await getPermit(addr, inch, '1', chainId, feeBank.address, addrAmount);
            const addrbalanceBefore = await inch.balanceOf(addr.address);

            await feeBank.depositWithPermit(addrAmount, permit);

            expect(await feeBank.accountDeposits(addr.address)).to.equal(addrAmount);
            expect(await matcher.creditAllowance(addr.address)).to.equal(addrAmount);
            expect(await inch.balanceOf(addr.address)).to.equal(addrbalanceBefore.sub(addrAmount));
        });

        it('should increase accountDeposits and creditAllowance without approve with depositForWithPermit()', async () => {
            const { inch, feeBank, matcher } = await loadFixture(initContracts);
            const addrAmount = ether('1');
            await inch.approve(feeBank.address, '0');
            const permit = await getPermit(addr, inch, '1', chainId, feeBank.address, addrAmount);
            const addrbalanceBefore = await inch.balanceOf(addr.address);

            await feeBank.depositForWithPermit(addr1.address, addrAmount, permit);

            expect(await feeBank.accountDeposits(addr1.address)).to.equal(addrAmount);
            expect(await matcher.creditAllowance(addr1.address)).to.equal(addrAmount);
            expect(await inch.balanceOf(addr.address)).to.equal(addrbalanceBefore.sub(addrAmount));
        });
    });

    describe('withdrawals', async () => {
        async function initContratsAndDeposit() {
            const { inch, feeBank, matcher } = await initContracts();
            const totalDepositAmount = ether('100');
            await feeBank.deposit(totalDepositAmount);
            return { inch, feeBank, matcher, totalDepositAmount };
        }

        it('should decrease accountDeposits and creditAllowance with withdraw()', async () => {
            const { inch, feeBank, matcher, totalDepositAmount } = await loadFixture(initContratsAndDeposit);
            const amount = ether('10');
            const addrbalanceBefore = await inch.balanceOf(addr.address);

            await feeBank.withdraw(amount);

            expect(await feeBank.accountDeposits(addr.address)).to.equal(totalDepositAmount.sub(amount));
            expect(await matcher.creditAllowance(addr.address)).to.equal(totalDepositAmount.sub(amount));
            expect(await inch.balanceOf(addr.address)).to.equal(addrbalanceBefore.add(amount));
        });

        it('should decrease accountDeposits and creditAllowance with withdrawTo()', async () => {
            const { inch, feeBank, matcher, totalDepositAmount } = await loadFixture(initContratsAndDeposit);
            const amount = ether('10');
            const addr1balanceBefore = await inch.balanceOf(addr1.address);

            await feeBank.withdrawTo(addr1.address, amount);

            expect(await feeBank.accountDeposits(addr.address)).to.equal(totalDepositAmount.sub(amount));
            expect(await matcher.creditAllowance(addr.address)).to.equal(totalDepositAmount.sub(amount));
            expect(await inch.balanceOf(addr1.address)).to.equal(addr1balanceBefore.add(amount));
        });

        it('should not withdrawal more than account have', async () => {
            const { feeBank, totalDepositAmount } = await loadFixture(initContratsAndDeposit);
            await expect(feeBank.withdraw(totalDepositAmount.add(1))).to.be.revertedWithPanic(PANIC_CODES.UNDERFLOW);
        });
    });

    describe('gatherFees', async () => {
        it('should correct withdrawal fee for 1 account', async () => {
            const { inch, feeBank, matcher } = await loadFixture(initContracts);
            const amount = ether('10');
            const subCreditAmount = ether('2');
            await feeBank.connect(addr1).deposit(amount);
            await matcher.setFeeBank(addr.address);
            await matcher.decreaseCreditAllowance(addr1.address, subCreditAmount);

            const balanceBefore = await inch.balanceOf(addr.address);
            expect(await feeBank.accountDeposits(addr1.address)).to.equal(amount);
            expect(await matcher.creditAllowance(addr1.address)).to.equal(amount.sub(subCreditAmount));
            await feeBank.gatherFees([addr1.address]);

            expect(await feeBank.accountDeposits(addr1.address)).to.equal(amount.sub(subCreditAmount));
            expect(await matcher.creditAllowance(addr1.address)).to.equal(amount.sub(subCreditAmount));
            expect(await inch.balanceOf(addr.address)).to.equal(balanceBefore.add(subCreditAmount));
        });

        it('should correct withdrawal fee for 2 account', async () => {
            const { inch, feeBank, matcher } = await loadFixture(initContracts);
            const addrAmount = ether('10');
            const addr1Amount = ether('25');
            const subCreditaddrAmount = ether('2');
            const subCreditAddr1Amount = ether('11');
            await feeBank.deposit(addrAmount);
            await feeBank.connect(addr1).deposit(addr1Amount);
            await matcher.setFeeBank(addr.address);
            await matcher.decreaseCreditAllowance(addr.address, subCreditaddrAmount);
            await matcher.decreaseCreditAllowance(addr1.address, subCreditAddr1Amount);

            const balanceBefore = await inch.balanceOf(addr.address);
            expect(await feeBank.accountDeposits(addr.address)).to.equal(addrAmount);
            expect(await feeBank.accountDeposits(addr1.address)).to.equal(addr1Amount);
            expect(await matcher.creditAllowance(addr.address)).to.equal(addrAmount.sub(subCreditaddrAmount));
            expect(await matcher.creditAllowance(addr1.address)).to.equal(addr1Amount.sub(subCreditAddr1Amount));
            await feeBank.gatherFees([addr.address, addr1.address]);

            expect(await feeBank.accountDeposits(addr.address)).to.equal(addrAmount.sub(subCreditaddrAmount));
            expect(await feeBank.accountDeposits(addr1.address)).to.equal(addr1Amount.sub(subCreditAddr1Amount));
            expect(await matcher.creditAllowance(addr.address)).to.equal(addrAmount.sub(subCreditaddrAmount));
            expect(await matcher.creditAllowance(addr1.address)).to.equal(addr1Amount.sub(subCreditAddr1Amount));
            expect(await inch.balanceOf(addr.address)).to.equal(
                balanceBefore.add(subCreditaddrAmount).add(subCreditAddr1Amount),
            );
        });

        it('should correct withdrawal fee for several account', async () => {
            const { inch, feeBank, matcher } = await loadFixture(initContracts);
            const accounts = [];
            const wallets = await ethers.getSigners();
            for (const wallet of wallets) {
                accounts.push(wallet.address);
            }
            const amounts = [];
            const subCreditAmounts = [];
            let totalSubCreditAmounts = ether('0');
            for (let i = 1; i < accounts.length; i++) {
                amounts[i] = BN.from(ethers.utils.randomBytes(8));
                subCreditAmounts[i] = BN.from(ethers.utils.randomBytes(2));
                totalSubCreditAmounts = totalSubCreditAmounts.add(subCreditAmounts[i]);
                await feeBank.depositFor(accounts[i], amounts[i]);
            }
            await matcher.setFeeBank(addr.address);
            for (let i = 1; i < accounts.length; i++) {
                await matcher.decreaseCreditAllowance(accounts[i], subCreditAmounts[i]);
            }

            const balanceBefore = await inch.balanceOf(addr.address);
            for (let i = 1; i < accounts.length; i++) {
                expect(await feeBank.accountDeposits(accounts[i])).to.equal(amounts[i]);
                expect(await matcher.creditAllowance(accounts[i])).to.equal(amounts[i].sub(subCreditAmounts[i]));
            }

            await feeBank.gatherFees(accounts);
            for (let i = 1; i < accounts.length; i++) {
                expect(await feeBank.accountDeposits(accounts[i])).to.equal(amounts[i].sub(subCreditAmounts[i]));
                expect(await matcher.creditAllowance(accounts[i])).to.equal(amounts[i].sub(subCreditAmounts[i]));
            }
            expect(await inch.balanceOf(addr.address)).to.equal(balanceBefore.add(totalSubCreditAmounts));
        });

        it('should not work by non-owner', async () => {
            const { feeBank } = await loadFixture(initContracts);
            await expect(feeBank.connect(addr1).gatherFees([addr.address, addr1.address])).to.be.revertedWith(
                'Ownable: caller is not the owner',
            );
        });
    });
});
