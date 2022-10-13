const { expect, ether, toBN } = require('@1inch/solidity-utils');
const { artifacts } = require('hardhat');

const WhitelistRegistry = artifacts.require('WhitelistRegistry');
const TokenMock = artifacts.require('TokenMock');
const THRESHOLD = ether('1');
const MAX_WHITELISTED = 10;

describe('WhitelistRegistry', async () => {
    let addrs;

    before(async () => {
        addrs = await web3.eth.getAccounts();
    });

    beforeEach(async () => {
        this.Staking = await TokenMock.new('ST1INCH', 'ST1INCH');
        this.WhitelistRegistry = await WhitelistRegistry.new(this.Staking.address, THRESHOLD, MAX_WHITELISTED);
        await this.Staking.mint(addrs[0], ether('100'));
    });

    describe('storage vars', async () => {
        it('check storage vars', async () => {
            expect(await this.WhitelistRegistry.resolverThreshold()).to.be.bignumber.equal(THRESHOLD);
            expect(await this.WhitelistRegistry.staking()).to.equal(this.Staking.address);
            expect(await this.WhitelistRegistry.maxWhitelisted()).to.be.bignumber.equal(toBN(MAX_WHITELISTED));
        });
    });

    describe('setters', async () => {
        it('threshold setter', async () => {
            await this.WhitelistRegistry.setResolverThreshold(toBN('0'));
            expect(await this.WhitelistRegistry.resolverThreshold()).to.be.bignumber.equal(toBN('0'));
        });
    });

    describe('register', async () => {
        it('should whitelist 10 addresses', async () => {
            for (let i = 1; i <= MAX_WHITELISTED; ++i) {
                await this.Staking.transfer(addrs[i], THRESHOLD);
            }
            for (let i = 1; i <= MAX_WHITELISTED; ++i) {
                await this.WhitelistRegistry.register({ from: addrs[i] });
                expect(await this.WhitelistRegistry.isWhitelisted(addrs[i])).to.be.equal(true);
            }
        });

        it('should fail to whitelist due to balance lower than threshold', async () => {
            await expect(this.WhitelistRegistry.register({ from: addrs[1] })).to.eventually.be.rejectedWith(
                'BalanceLessThanThreshold()',
            );
        });

        it('should whitelist 10 addresses, then fail to whitelist due to not enough balance, then whitelist successfully', async () => {
            for (let i = 1; i <= MAX_WHITELISTED + 1; ++i) {
                await this.Staking.transfer(addrs[i], THRESHOLD);
            }
            for (let i = 1; i <= MAX_WHITELISTED; ++i) {
                await this.WhitelistRegistry.register({ from: addrs[i] });
                expect(await this.WhitelistRegistry.isWhitelisted(addrs[i])).to.be.equal(true);
            }
            await expect(
                this.WhitelistRegistry.register({
                    from: addrs[MAX_WHITELISTED + 1],
                }),
            ).to.eventually.be.rejectedWith('NotEnoughBalance()');
            expect(await this.WhitelistRegistry.isWhitelisted(addrs[MAX_WHITELISTED + 1])).to.be.equal(false);
            for (let i = 1; i <= MAX_WHITELISTED; ++i) {
                await this.Staking.transfer(addrs[0], THRESHOLD, {
                    from: addrs[i],
                });
                expect(await this.WhitelistRegistry.isWhitelisted(addrs[i])).to.be.equal(true);
            }
            await this.Staking.transfer(addrs[MAX_WHITELISTED + 1], THRESHOLD);
            await this.WhitelistRegistry.register({
                from: addrs[MAX_WHITELISTED + 1],
            });
            expect(await this.WhitelistRegistry.isWhitelisted(addrs[MAX_WHITELISTED + 1])).to.be.equal(true);
            expect(await this.WhitelistRegistry.isWhitelisted(addrs[1])).to.be.equal(false);
            for (let i = 2; i <= MAX_WHITELISTED + 1; ++i) {
                expect(await this.WhitelistRegistry.isWhitelisted(addrs[i])).to.be.equal(true);
            }
        });

        it('should whitelist 10 addresses, then lower balance, then whitelist successfully', async () => {
            for (let i = 1; i <= MAX_WHITELISTED + 1; ++i) {
                await this.Staking.transfer(addrs[i], THRESHOLD);
            }
            for (let i = 1; i <= MAX_WHITELISTED; ++i) {
                await this.WhitelistRegistry.register({ from: addrs[i] });
                expect(await this.WhitelistRegistry.isWhitelisted(addrs[i])).to.be.equal(true);
            }
            await this.Staking.transfer(addrs[0], toBN('1'), {
                from: addrs[3],
            });
            expect(await this.WhitelistRegistry.isWhitelisted(addrs[3])).to.be.equal(true);
            await this.WhitelistRegistry.register({
                from: addrs[MAX_WHITELISTED + 1],
            });
            expect(await this.WhitelistRegistry.isWhitelisted(addrs[MAX_WHITELISTED + 1])).to.be.equal(true);
            expect(await this.WhitelistRegistry.isWhitelisted(addrs[3])).to.be.equal(false);
        });

        it('should whitelist 10 addresses, then whitelist 9 times successfully', async () => {
            for (let i = 1; i <= MAX_WHITELISTED + 9; ++i) {
                await this.Staking.transfer(addrs[i], i <= MAX_WHITELISTED ? THRESHOLD : THRESHOLD.add(toBN('1')));
            }
            for (let i = 1; i <= MAX_WHITELISTED + 9; ++i) {
                await this.WhitelistRegistry.register({ from: addrs[i] });
                expect(await this.WhitelistRegistry.isWhitelisted(addrs[i])).to.be.equal(true);
            }
            let whitelisted = 0;
            for (let i = 1; i <= MAX_WHITELISTED; ++i) {
                whitelisted += await this.WhitelistRegistry.isWhitelisted(addrs[i]);
            }
            expect(whitelisted).to.be.equal(1);
        });
    });

    describe('clean', async () => {
        it('should remove from whitelist addresses which not enough staked balance', async () => {
            for (let i = 0; i < MAX_WHITELISTED; ++i) {
                await this.Staking.transfer(addrs[i], THRESHOLD.addn(1));
                await this.WhitelistRegistry.register({ from: addrs[i] });
                expect(await this.WhitelistRegistry.isWhitelisted(addrs[i])).to.be.equal(true);
                if (i % 2 === 1) {
                    await this.Staking.transfer(addrs[0], '2', { from: addrs[i] });
                }
            }
            await this.WhitelistRegistry.clean();
            for (let i = 0; i < MAX_WHITELISTED; ++i) {
                if (i % 2 === 1) {
                    expect(await this.WhitelistRegistry.isWhitelisted(addrs[i])).to.be.equal(false);
                } else {
                    expect(await this.WhitelistRegistry.isWhitelisted(addrs[i])).to.be.equal(true);
                }
            }
        });
    });

    describe('setMaxWhitelisted', async () => {
        const expectAddrsInWhitelist = async (indexFrom, indexTo, except = []) => {
            for (let i = indexFrom; i <= indexTo; i++) {
                if (except.indexOf(i) !== -1) {
                    expect(await this.WhitelistRegistry.isWhitelisted(addrs[i])).to.be.equal(false);
                } else {
                    expect(await this.WhitelistRegistry.isWhitelisted(addrs[i])).to.be.equal(true);
                }
            }
        };

        beforeEach(async () => {
            this.whitelestedAmount = MAX_WHITELISTED / 5;
            for (let i = 1; i <= this.whitelestedAmount; ++i) {
                await this.Staking.transfer(addrs[i], THRESHOLD);
                await this.WhitelistRegistry.register({ from: addrs[i] });
            }
        });

        describe('increase more than current max whitelist size', async () => {
            it('should not change whitelist', async () => {
                await this.WhitelistRegistry.setMaxWhitelisted(MAX_WHITELISTED + 1);
                await expectAddrsInWhitelist(1, this.whitelestedAmount);
            });

            it('should increase max whitelist size', async () => {
                const NEW_MAX_WHITELISTED = MAX_WHITELISTED + 1;
                await this.WhitelistRegistry.setMaxWhitelisted(NEW_MAX_WHITELISTED);

                // add to whitelist additional addrs, total more than initially MAX_WHITELISTED
                for (let i = this.whitelestedAmount + 1; i <= NEW_MAX_WHITELISTED; ++i) {
                    await this.Staking.transfer(addrs[i], THRESHOLD);
                    await this.WhitelistRegistry.register({ from: addrs[i] });
                }
                await expectAddrsInWhitelist(1, NEW_MAX_WHITELISTED);

                // add to whitelist additional addrs, total more than NEW_MAX_WHITELISTED
                await this.Staking.transfer(addrs[NEW_MAX_WHITELISTED + 1], THRESHOLD);
                await expect(
                    this.WhitelistRegistry.register({
                        from: addrs[NEW_MAX_WHITELISTED + 1],
                    }),
                ).to.eventually.be.rejectedWith('NotEnoughBalance()');
            });
        });

        describe('decrease but stay more than whitelisted amount', async () => {
            it('should not change whitelist ', async () => {
                await this.WhitelistRegistry.setMaxWhitelisted(this.whitelestedAmount + 1);
                await expectAddrsInWhitelist(1, this.whitelestedAmount);
            });

            it('should decrease max whitelist size', async () => {
                const NEW_MAX_WHITELISTED = MAX_WHITELISTED - 1;
                await this.WhitelistRegistry.setMaxWhitelisted(NEW_MAX_WHITELISTED);

                // add to whitelist additional addrs, total NEW_MAX_WHITELISTED
                for (let i = this.whitelestedAmount + 1; i <= NEW_MAX_WHITELISTED; ++i) {
                    await this.Staking.transfer(addrs[i], THRESHOLD);
                    await this.WhitelistRegistry.register({ from: addrs[i] });
                }
                await expectAddrsInWhitelist(1, NEW_MAX_WHITELISTED);

                // add to whitelist additional addrs, total more than NEW_MAX_WHITELISTED
                await this.Staking.transfer(addrs[NEW_MAX_WHITELISTED + 1], THRESHOLD);
                await expect(
                    this.WhitelistRegistry.register({
                        from: addrs[NEW_MAX_WHITELISTED + 1],
                    }),
                ).to.eventually.be.rejectedWith('NotEnoughBalance()');
            });
        });

        describe('decrease less than whitelisted amount', async () => {
            it('should remove last added addresses when staking balances are equals', async () => {
                await this.WhitelistRegistry.setMaxWhitelisted(this.whitelestedAmount - 1);
                await expectAddrsInWhitelist(1, this.whitelestedAmount, [this.whitelestedAmount]);
            });

            it('should remove addresses with least staking amount ', async () => {
                // make the addrs[2] with the least balance
                for (let i = 1; i <= this.whitelestedAmount; i++) {
                    await this.Staking.transfer(addrs[i], i === 2 ? 1 : i * 100);
                }
                await this.WhitelistRegistry.setMaxWhitelisted(this.whitelestedAmount - 1);
                await expectAddrsInWhitelist(1, this.whitelestedAmount, [2]);
            });

            it('should decrease max whitelist size', async () => {
                const NEW_MAX_WHITELISTED = this.whitelestedAmount - 1;
                await this.WhitelistRegistry.setMaxWhitelisted(NEW_MAX_WHITELISTED);

                // add to whitelist additional addr
                await this.Staking.transfer(addrs[this.whitelestedAmount + 1], THRESHOLD);
                await expect(
                    this.WhitelistRegistry.register({
                        from: addrs[this.whitelestedAmount + 1],
                    }),
                ).to.eventually.be.rejectedWith('NotEnoughBalance()');
            });

            it('should remove addresses with least staking amount when addresses have random balances', async () => {
                await this.WhitelistRegistry.setMaxWhitelisted(MAX_WHITELISTED);
                for (let i = this.whitelestedAmount + 1; i <= MAX_WHITELISTED; ++i) {
                    await this.Staking.transfer(addrs[i], THRESHOLD);
                    await this.WhitelistRegistry.register({ from: addrs[i] });
                }

                // make random amounts
                await this.Staking.transfer(addrs[1], ether('2'));
                await this.Staking.transfer(addrs[2], ether('11'));
                await this.Staking.transfer(addrs[3], ether('6'));
                await this.Staking.transfer(addrs[4], ether('3'));
                await this.Staking.transfer(addrs[5], ether('7'));
                await this.Staking.transfer(addrs[6], ether('1'));
                await this.Staking.transfer(addrs[7], ether('2'));
                await this.Staking.transfer(addrs[8], ether('6'));
                await this.Staking.transfer(addrs[9], ether('8'));
                await this.Staking.transfer(addrs[10], ether('2'));

                await this.WhitelistRegistry.setMaxWhitelisted(4);

                console.log(await this.WhitelistRegistry.getWhitelist());
                await expectAddrsInWhitelist(1, this.whitelestedAmount, [1, 3, 4, 6, 7, 10]);
            });
        });
    });
});
