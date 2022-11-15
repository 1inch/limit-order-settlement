const { expect, ether } = require('@1inch/solidity-utils');
const { ethers } = require('hardhat');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

describe('FeeBankCharger', function () {
    let addr, addr1;

    before(async function () {
        [addr, addr1] = await ethers.getSigners();
    });

    async function initContracts() {
        const TokenPermitMock = await ethers.getContractFactory('ERC20PermitMock');
        const inch = await TokenPermitMock.deploy('1INCH', '1INCH', addr.address, ether('1000'));
        await inch.deployed();
        const FeeBankCharger = await ethers.getContractFactory('FeeBankCharger');
        const charger = await FeeBankCharger.deploy(inch.address);
        await charger.deployed();

        const FeeBank = await ethers.getContractFactory('FeeBank');
        const feeBank = FeeBank.attach(await charger.feeBank());

        await inch.transfer(addr1.address, ether('100'));
        await inch.approve(feeBank.address, ether('1000'));
        await inch.connect(addr1).approve(feeBank.address, ether('1000'));

        return { inch, charger, feeBank };
    }

    describe('increaseAvailableCredit', function () {
        it('should increase credit', async function () {
            const { charger, feeBank } = await loadFixture(initContracts);
            const amount = ether('100');
            expect(await charger.availableCredit(addr1.address)).to.equal('0');
            await feeBank.depositFor(addr1.address, amount);
            expect(await charger.availableCredit(addr1.address)).to.equal(amount);
        });

        it('should not increase credit by non-feeBank address', async function () {
            const { charger } = await loadFixture(initContracts);
            await expect(charger.increaseAvailableCredit(addr1.address, ether('100'))).to.be.revertedWithCustomError(
                charger,
                'OnlyFeeBankAccess',
            );
        });
    });

    describe('decreaseAvailableCredit', function () {
        async function initContractsAndAllowance() {
            const { charger, feeBank } = await initContracts();
            const creditAmount = ether('100');
            await feeBank.deposit(creditAmount);
            return { charger, feeBank, creditAmount };
        }

        it('should decrease credit', async function () {
            const { charger, feeBank, creditAmount } = await loadFixture(initContractsAndAllowance);
            const amount = ether('10');
            expect(await charger.availableCredit(addr.address)).to.equal(creditAmount);
            await feeBank.withdrawTo(addr1.address, amount);
            expect(await charger.availableCredit(addr.address)).to.equal(creditAmount - amount);
        });

        it('should not deccrease credit by non-feeBank address', async function () {
            const { charger } = await loadFixture(initContractsAndAllowance);
            await expect(charger.decreaseAvailableCredit(addr1.address, ether('10'))).to.be.revertedWithCustomError(
                charger,
                'OnlyFeeBankAccess',
            );
        });
    });
});
