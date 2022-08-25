const { expect, ether, toBN } = require('@1inch/solidity-utils');
const { artifacts } = require('hardhat');

const WhitelistRegistrySimple = artifacts.require('WhitelistRegistrySimple');
const TokenMock = artifacts.require('TokenMock');

const Status = Object.freeze({
    ProUnverified: toBN('0'),
    ProVerified: toBN('1'),
    ProPending: toBN('2'),
});

describe('WhitelistRegistrySimple', async () => {
    let addr1, addr2, addr3;

    before(async () => {
        [addr1, addr2, addr3] = await web3.eth.getAccounts();
    });

    beforeEach(async () => {
        this.whitelistRegistrySimple = await WhitelistRegistrySimple.new();
    });

    describe('batchSetStatus', async () => {
        it('should set statuses to several addresses', async () => {
            for (const addr of [addr1, addr2, addr3]) {
                expect(await this.whitelistRegistrySimple.status(addr)).to.be.bignumber.eq(Status.ProUnverified);
            }
            await this.whitelistRegistrySimple.batchSetStatus([addr1, addr2], [Status.ProVerified, Status.ProPending]);
            expect(await this.whitelistRegistrySimple.status(addr1)).to.be.bignumber.eq(Status.ProVerified);
            expect(await this.whitelistRegistrySimple.status(addr2)).to.be.bignumber.eq(Status.ProPending);
            expect(await this.whitelistRegistrySimple.status(addr3)).to.be.bignumber.eq(Status.ProUnverified);
        });

        it('should not change addr\'s status to the same status', async () => {
            await expect(this.whitelistRegistrySimple.batchSetStatus([addr1, addr2], [Status.ProUnverified, Status.ProPending]))
                .to.eventually.be.rejectedWith('SameStatus()');
            await expect(this.whitelistRegistrySimple.batchSetStatus([addr1, addr2], [Status.ProVerified, Status.ProUnverified]))
                .to.eventually.be.rejectedWith('SameStatus()');
        });

        it('should not work with different param\'s size', async () => {
            await expect(this.whitelistRegistrySimple.batchSetStatus([addr1, addr2, addr3], [Status.ProVerified, Status.ProVerified]))
                .to.eventually.be.rejectedWith('ArraysLengthsDoNotMatch()');
            await expect(this.whitelistRegistrySimple.batchSetStatus([addr1, addr2], [Status.ProVerified, Status.ProVerified, Status.ProVerified]))
                .to.eventually.be.rejectedWith('ArraysLengthsDoNotMatch()');
        });

        it('should not work by non-owner', async () => {
            await expect(this.whitelistRegistrySimple.batchSetStatus([addr1, addr2], [Status.ProVerified, Status.ProPending], { from: addr2 }))
                .to.eventually.be.rejectedWith('Ownable: caller is not the owner');
        });
    });

    describe('setStatus', async () => {
        it('should set status', async () => {
            expect(await this.whitelistRegistrySimple.status(addr1)).to.be.bignumber.eq(Status.ProUnverified);
            await this.whitelistRegistrySimple.setStatus(addr1, Status.ProVerified);
            expect(await this.whitelistRegistrySimple.status(addr1)).to.be.bignumber.eq(Status.ProVerified);
        });

        it('should not change addr\'s status to the same status', async () => {
            await expect(this.whitelistRegistrySimple.setStatus(addr1, Status.ProUnverified))
                .to.eventually.be.rejectedWith('SameStatus()');

            await this.whitelistRegistrySimple.setStatus(addr1, Status.ProVerified);
            await expect(this.whitelistRegistrySimple.setStatus(addr1, Status.ProVerified))
                .to.eventually.be.rejectedWith('SameStatus()');
        });

        it('should not work by non-owner', async () => {
            await expect(this.whitelistRegistrySimple.setStatus(addr1, Status.ProVerified, { from: addr2 }))
                .to.eventually.be.rejectedWith('Ownable: caller is not the owner');
        });
    });

    describe('rescueFunds', async () => {
        before(async () => {
            this.token = await TokenMock.new('Token', 'TKN');
            await this.token.mint(addr1, ether('10'));
        });

        beforeEach(async () => {
            await this.token.transfer(this.whitelistRegistrySimple.address, ether('1'));
            expect(await this.token.balanceOf(this.whitelistRegistrySimple.address)).to.be.bignumber.equals(ether('1'));
        });

        it('should rescue funds', async () => {
            const balanceBefore = await this.token.balanceOf(addr1);
            await this.whitelistRegistrySimple.rescueFunds(this.token.address, ether('1'));
            expect(await this.token.balanceOf(addr1)).to.be.bignumber.eq(balanceBefore.add(ether('1')));
        });

        it('should not work by non-owner', async () => {
            await expect(this.whitelistRegistrySimple.rescueFunds(this.token.address, ether('1'), { from: addr2 }))
                .to.eventually.be.rejectedWith('Ownable: caller is not the owner');
        });
    });
});
