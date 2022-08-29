const { expect, ether, toBN } = require('@1inch/solidity-utils');
const { artifacts } = require('hardhat');
const { addr0Wallet, addr1Wallet } = require('./helpers/utils');
const { getPermit } = require('@1inch/solidity-utils');

const FeeBank = artifacts.require('FeeBank');
const TokenPermitMock = artifacts.require('ERC20PermitMock');
const WrappedTokenMock = artifacts.require('WrappedTokenMock');
const LimitOrderProtocol = artifacts.require('LimitOrderProtocol');
const WhitelistRegistrySimple = artifacts.require('WhitelistRegistrySimple');
const Settlement = artifacts.require('Settlement');

describe('FeeBank', async () => {
    const [addr0, addr1] = [addr0Wallet.getAddressString(), addr1Wallet.getAddressString()];

    before(async () => {
        this.chainId = await web3.eth.getChainId();
        this.whitelistRegistrySimple = await WhitelistRegistrySimple.new();
    });

    beforeEach(async () => {
        this.inch = await TokenPermitMock.new('1INCH', '1INCH', addr0, ether('1000'));
        this.weth = await WrappedTokenMock.new('WETH', 'WETH');

        this.swap = await LimitOrderProtocol.new(this.weth.address);
        this.matcher = await Settlement.new(this.whitelistRegistrySimple.address, this.swap.address);
        this.feeBank = await FeeBank.new(this.matcher.address, this.inch.address);

        await this.matcher.setFeeBank(this.feeBank.address);
        await this.inch.transfer(addr1, ether('100'), { from: addr0 });
        await this.inch.approve(this.feeBank.address, ether('1000'), { from: addr0 });
        await this.inch.approve(this.feeBank.address, ether('1000'), { from: addr1 });
    });

    describe('deposits', async () => {
        it('should increase accountDeposits and creditAllowance with deposit()', async () => {
            const addr0Amount = ether('1');
            const addr1Amount = ether('10');
            const addr0balanceBefore = await this.inch.balanceOf(addr0);
            const addr1balanceBefore = await this.inch.balanceOf(addr1);

            await this.feeBank.deposit(addr0Amount, { from: addr0 });
            await this.feeBank.deposit(addr1Amount, { from: addr1 });

            expect(await this.feeBank.accountDeposits(addr0)).to.be.bignumber.eq(addr0Amount);
            expect(await this.feeBank.accountDeposits(addr1)).to.be.bignumber.eq(addr1Amount);
            expect(await this.matcher.creditAllowance(addr0)).to.be.bignumber.eq(addr0Amount);
            expect(await this.matcher.creditAllowance(addr1)).to.be.bignumber.eq(addr1Amount);
            expect(await this.inch.balanceOf(addr0)).to.be.bignumber.eq(addr0balanceBefore.sub(addr0Amount));
            expect(await this.inch.balanceOf(addr1)).to.be.bignumber.eq(addr1balanceBefore.sub(addr1Amount));
        });

        it('should increase accountDeposits and creditAllowance with depositFor()', async () => {
            const addr0Amount = ether('1');
            const addr1Amount = ether('10');
            const addr0balanceBefore = await this.inch.balanceOf(addr0);
            const addr1balanceBefore = await this.inch.balanceOf(addr1);

            await this.feeBank.depositFor(addr0, addr0Amount, { from: addr1 });
            await this.feeBank.depositFor(addr1, addr1Amount, { from: addr0 });

            expect(await this.feeBank.accountDeposits(addr0)).to.be.bignumber.eq(addr0Amount);
            expect(await this.feeBank.accountDeposits(addr1)).to.be.bignumber.eq(addr1Amount);
            expect(await this.matcher.creditAllowance(addr0)).to.be.bignumber.eq(addr0Amount);
            expect(await this.matcher.creditAllowance(addr1)).to.be.bignumber.eq(addr1Amount);
            expect(await this.inch.balanceOf(addr0)).to.be.bignumber.eq(addr0balanceBefore.sub(addr1Amount));
            expect(await this.inch.balanceOf(addr1)).to.be.bignumber.eq(addr1balanceBefore.sub(addr0Amount));
        });

        it('should increase accountDeposits and creditAllowance without approve with depositWithPermit()', async () => {
            const addr0Amount = ether('1');
            await this.inch.approve(this.feeBank.address, '0', { from: addr0 });
            const permit = await getPermit(addr0, addr0Wallet.getPrivateKey(), this.inch, '1', this.chainId, this.feeBank.address, addr0Amount);
            const addr0balanceBefore = await this.inch.balanceOf(addr0);

            await this.feeBank.depositWithPermit(addr0Amount, permit, { from: addr0 });

            expect(await this.feeBank.accountDeposits(addr0)).to.be.bignumber.eq(addr0Amount);
            expect(await this.matcher.creditAllowance(addr0)).to.be.bignumber.eq(addr0Amount);
            expect(await this.inch.balanceOf(addr0)).to.be.bignumber.eq(addr0balanceBefore.sub(addr0Amount));
        });

        it('should increase accountDeposits and creditAllowance without approve with depositForWithPermit()', async () => {
            const addr0Amount = ether('1');
            await this.inch.approve(this.feeBank.address, '0', { from: addr0 });
            const permit = await getPermit(addr0, addr0Wallet.getPrivateKey(), this.inch, '1', this.chainId, this.feeBank.address, addr0Amount);
            const addr0balanceBefore = await this.inch.balanceOf(addr0);

            await this.feeBank.depositForWithPermit(addr1, addr0Amount, permit, { from: addr0 });

            expect(await this.feeBank.accountDeposits(addr1)).to.be.bignumber.eq(addr0Amount);
            expect(await this.matcher.creditAllowance(addr1)).to.be.bignumber.eq(addr0Amount);
            expect(await this.inch.balanceOf(addr0)).to.be.bignumber.eq(addr0balanceBefore.sub(addr0Amount));
        });
    });

    describe('withdrawals', async () => {
        beforeEach(async () => {
            this.totalDepositAmount = ether('100');
            await this.feeBank.deposit(this.totalDepositAmount);
        });

        it('should decrease accountDeposits and creditAllowance with withdraw()', async () => {
            const amount = ether('10');
            const addr0balanceBefore = await this.inch.balanceOf(addr0);

            await this.feeBank.withdraw(amount);

            expect(await this.feeBank.accountDeposits(addr0)).to.be.bignumber.eq(this.totalDepositAmount.sub(amount));
            expect(await this.matcher.creditAllowance(addr0)).to.be.bignumber.eq(this.totalDepositAmount.sub(amount));
            expect(await this.inch.balanceOf(addr0)).to.be.bignumber.eq(addr0balanceBefore.add(amount));
        });

        it('should decrease accountDeposits and creditAllowance with withdrawTo()', async () => {
            const amount = ether('10');
            const addr1balanceBefore = await this.inch.balanceOf(addr1);

            await this.feeBank.withdrawTo(addr1, amount);

            expect(await this.feeBank.accountDeposits(addr0)).to.be.bignumber.eq(this.totalDepositAmount.sub(amount));
            expect(await this.matcher.creditAllowance(addr0)).to.be.bignumber.eq(this.totalDepositAmount.sub(amount));
            expect(await this.inch.balanceOf(addr1)).to.be.bignumber.eq(addr1balanceBefore.add(amount));
        });

        it('should not withdrawal more than account have', async () => {
            // eslint-disable-next-line max-len
            const ArithmeticOperationRevertMessage = 'VM Exception while processing transaction: reverted with panic code 0x11 (Arithmetic operation underflowed or overflowed outside of an unchecked block)';
            await expect(this.feeBank.withdraw(this.totalDepositAmount.addn(1)))
                .to.eventually.be.rejectedWith(ArithmeticOperationRevertMessage);
        });
    });

    describe('gatherFees', async () => {
        it('should correct withdrawal fee for 1 account', async () => {
            const amount = ether('10');
            const subCreditAmount = ether('2');
            await this.feeBank.deposit(amount, { from: addr1 });
            await this.matcher.setFeeBank(addr0);
            await this.matcher.subCreditAllowance(addr1, subCreditAmount);

            const balanceBefore = await this.inch.balanceOf(addr0);
            expect(await this.feeBank.accountDeposits(addr1)).to.be.bignumber.eq(amount);
            expect(await this.matcher.creditAllowance(addr1)).to.be.bignumber.eq(amount.sub(subCreditAmount));
            await this.feeBank.gatherFees([addr1]);

            expect(await this.feeBank.accountDeposits(addr1)).to.be.bignumber.eq(amount.sub(subCreditAmount));
            expect(await this.matcher.creditAllowance(addr1)).to.be.bignumber.eq(amount.sub(subCreditAmount));
            expect(await this.inch.balanceOf(addr0)).to.be.bignumber.eq(balanceBefore.add(subCreditAmount));
        });

        it('should correct withdrawal fee for 2 account', async () => {
            const addr0Amount = ether('10');
            const addr1Amount = ether('25');
            const subCreditAddr0Amount = ether('2');
            const subCreditAddr1Amount = ether('11');
            await this.feeBank.deposit(addr0Amount, { from: addr0 });
            await this.feeBank.deposit(addr1Amount, { from: addr1 });
            await this.matcher.setFeeBank(addr0);
            await this.matcher.subCreditAllowance(addr0, subCreditAddr0Amount);
            await this.matcher.subCreditAllowance(addr1, subCreditAddr1Amount);

            const balanceBefore = await this.inch.balanceOf(addr0);
            expect(await this.feeBank.accountDeposits(addr0)).to.be.bignumber.eq(addr0Amount);
            expect(await this.feeBank.accountDeposits(addr1)).to.be.bignumber.eq(addr1Amount);
            expect(await this.matcher.creditAllowance(addr0)).to.be.bignumber.eq(addr0Amount.sub(subCreditAddr0Amount));
            expect(await this.matcher.creditAllowance(addr1)).to.be.bignumber.eq(addr1Amount.sub(subCreditAddr1Amount));
            await this.feeBank.gatherFees([addr0, addr1]);

            expect(await this.feeBank.accountDeposits(addr0)).to.be.bignumber.eq(addr0Amount.sub(subCreditAddr0Amount));
            expect(await this.feeBank.accountDeposits(addr1)).to.be.bignumber.eq(addr1Amount.sub(subCreditAddr1Amount));
            expect(await this.matcher.creditAllowance(addr0)).to.be.bignumber.eq(addr0Amount.sub(subCreditAddr0Amount));
            expect(await this.matcher.creditAllowance(addr1)).to.be.bignumber.eq(addr1Amount.sub(subCreditAddr1Amount));
            expect(await this.inch.balanceOf(addr0)).to.be.bignumber.eq(balanceBefore.add(subCreditAddr0Amount).add(subCreditAddr1Amount));
        });

        it('should correct withdrawal fee for several account', async () => {
            const accounts = await web3.eth.getAccounts();
            const amounts = [];
            const subCreditAmounts = [];
            let totalSubCreditAmounts = ether('0');
            for (let i = 0; i < accounts.length; i++) {
                amounts[i] = toBN(web3.utils.randomHex(8));
                subCreditAmounts[i] = toBN(web3.utils.randomHex(2));
                totalSubCreditAmounts = totalSubCreditAmounts.add(subCreditAmounts[i]);
                await this.feeBank.depositFor(accounts[i], amounts[i]);
            }
            await this.matcher.setFeeBank(addr0);
            for (let i = 0; i < accounts.length; i++) {
                await this.matcher.subCreditAllowance(accounts[i], subCreditAmounts[i]);
            }

            const balanceBefore = await this.inch.balanceOf(addr0);
            for (let i = 0; i < accounts.length; i++) {
                expect(await this.feeBank.accountDeposits(accounts[i])).to.be.bignumber.eq(amounts[i]);
                expect(await this.matcher.creditAllowance(accounts[i])).to.be.bignumber.eq(amounts[i].sub(subCreditAmounts[i]));
            }

            await this.feeBank.gatherFees(accounts);
            for (let i = 0; i < accounts.length; i++) {
                expect(await this.feeBank.accountDeposits(accounts[i])).to.be.bignumber.eq(amounts[i].sub(subCreditAmounts[i]));
                expect(await this.matcher.creditAllowance(accounts[i])).to.be.bignumber.eq(amounts[i].sub(subCreditAmounts[i]));
            }
            expect(await this.inch.balanceOf(addr0)).to.be.bignumber.eq(balanceBefore.add(totalSubCreditAmounts));
        });

        it('should not work by non-owner', async () => {
            await expect(this.feeBank.gatherFees([addr0, addr1], { from: addr1 }))
                .to.eventually.be.rejectedWith('Ownable: caller is not the owner');
        });
    });
});
