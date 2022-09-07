const { expect, ether } = require('@1inch/solidity-utils');
const { artifacts } = require('hardhat');

const WhitelistRegistrySimple = artifacts.require('WhitelistRegistrySimple');
const TokenMock = artifacts.require('TokenMock');

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
                expect(
                    await this.whitelistRegistrySimple.isWhitelisted(addr),
                ).to.be.eq(false);
            }
            await this.whitelistRegistrySimple.batchSetStatus(
                [addr1, addr2],
                [true, true],
            );
            expect(
                await this.whitelistRegistrySimple.isWhitelisted(addr1),
            ).to.be.eq(true);
            expect(
                await this.whitelistRegistrySimple.isWhitelisted(addr2),
            ).to.be.eq(true);
            expect(
                await this.whitelistRegistrySimple.isWhitelisted(addr3),
            ).to.be.eq(false);
        });

        it('should not change addr\'s status to the same status', async () => {
            await expect(
                this.whitelistRegistrySimple.batchSetStatus(
                    [addr1, addr2],
                    [false, false],
                ),
            ).to.eventually.be.rejectedWith('SameStatus()');
            await expect(
                this.whitelistRegistrySimple.batchSetStatus(
                    [addr1, addr2],
                    [true, false],
                ),
            ).to.eventually.be.rejectedWith('SameStatus()');
        });

        it('should not work with different param\'s size', async () => {
            await expect(
                this.whitelistRegistrySimple.batchSetStatus(
                    [addr1, addr2, addr3],
                    [true, true],
                ),
            ).to.eventually.be.rejectedWith('ArraysLengthsDoNotMatch()');
            await expect(
                this.whitelistRegistrySimple.batchSetStatus(
                    [addr1, addr2],
                    [true, true, true],
                ),
            ).to.eventually.be.rejectedWith('ArraysLengthsDoNotMatch()');
        });

        it('should not work by non-owner', async () => {
            await expect(
                this.whitelistRegistrySimple.batchSetStatus(
                    [addr1, addr2],
                    [true, false],
                    { from: addr2 },
                ),
            ).to.eventually.be.rejectedWith('Ownable: caller is not the owner');
        });
    });

    describe('setStatus', async () => {
        it('should set status', async () => {
            expect(
                await this.whitelistRegistrySimple.isWhitelisted(addr1),
            ).to.be.eq(false);
            await this.whitelistRegistrySimple.setStatus(addr1, true);
            expect(
                await this.whitelistRegistrySimple.isWhitelisted(addr1),
            ).to.be.eq(true);
        });

        it('should not change addr\'s status to the same status', async () => {
            await expect(
                this.whitelistRegistrySimple.setStatus(addr1, false),
            ).to.eventually.be.rejectedWith('SameStatus()');

            await this.whitelistRegistrySimple.setStatus(addr1, true);
            await expect(
                this.whitelistRegistrySimple.setStatus(addr1, true),
            ).to.eventually.be.rejectedWith('SameStatus()');
        });

        it('should not work by non-owner', async () => {
            await expect(
                this.whitelistRegistrySimple.setStatus(addr1, true, {
                    from: addr2,
                }),
            ).to.eventually.be.rejectedWith('Ownable: caller is not the owner');
        });
    });

    describe('rescueFunds', async () => {
        before(async () => {
            this.token = await TokenMock.new('Token', 'TKN');
            await this.token.mint(addr1, ether('10'));
        });

        beforeEach(async () => {
            await this.token.transfer(
                this.whitelistRegistrySimple.address,
                ether('1'),
            );
            expect(
                await this.token.balanceOf(this.whitelistRegistrySimple.address),
            ).to.be.bignumber.equals(ether('1'));
        });

        it('should rescue funds', async () => {
            const balanceBefore = await this.token.balanceOf(addr1);
            await this.whitelistRegistrySimple.rescueFunds(
                this.token.address,
                ether('1'),
            );
            expect(await this.token.balanceOf(addr1)).to.be.bignumber.eq(
                balanceBefore.add(ether('1')),
            );
        });

        it('should not work by non-owner', async () => {
            await expect(
                this.whitelistRegistrySimple.rescueFunds(
                    this.token.address,
                    ether('1'),
                    { from: addr2 },
                ),
            ).to.eventually.be.rejectedWith('Ownable: caller is not the owner');
        });
    });
});
