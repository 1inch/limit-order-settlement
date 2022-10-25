const { expect, ether, toBN, constants } = require('@1inch/solidity-utils');
const { artifacts } = require('hardhat');

const WhitelistRegistry = artifacts.require('WhitelistRegistry');
const RewardableDelegationTopicWithVotingPowerMock = artifacts.require('RewardableDelegationTopicWithVotingPowerMock');
const St1inch = artifacts.require('St1inch');
const THRESHOLD = ether('1');
const VOTING_POWER_THRESHOLD = THRESHOLD.muln(2);
const MAX_WHITELISTED = 10;

describe('WhitelistRegistry', async () => {
    let addrs;
    let st1inch;

    before(async () => {
        addrs = await web3.eth.getAccounts();
        st1inch = await St1inch.new(constants.ZERO_ADDRESS, 0, 0, 0);
    });

    beforeEach(async () => {
        this.RewardDelegationTopic = await RewardableDelegationTopicWithVotingPowerMock.new('reward1INCH', 'reward1INCH', st1inch.address);
        this.WhitelistRegistry = await WhitelistRegistry.new(this.RewardDelegationTopic.address, THRESHOLD, MAX_WHITELISTED);
    });

    describe('storage vars', async () => {
        it('check storage vars', async () => {
            expect(await this.WhitelistRegistry.resolverThreshold()).to.be.bignumber.equal(THRESHOLD);
            expect(await this.WhitelistRegistry.maxWhitelisted()).to.be.bignumber.equal(toBN(MAX_WHITELISTED));
            expect(await this.WhitelistRegistry.token()).to.equal(this.RewardDelegationTopic.address);
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
                await this.RewardDelegationTopic.mint(addrs[i], VOTING_POWER_THRESHOLD);
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
                await this.RewardDelegationTopic.mint(addrs[i], VOTING_POWER_THRESHOLD);
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
                await this.RewardDelegationTopic.burn(addrs[i], THRESHOLD);
                expect(await this.WhitelistRegistry.isWhitelisted(addrs[i])).to.be.equal(true);
            }
            await this.RewardDelegationTopic.mint(addrs[MAX_WHITELISTED + 1], THRESHOLD);
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
                await this.RewardDelegationTopic.mint(addrs[i], VOTING_POWER_THRESHOLD);
            }
            for (let i = 1; i <= MAX_WHITELISTED; ++i) {
                await this.WhitelistRegistry.register({ from: addrs[i] });
                expect(await this.WhitelistRegistry.isWhitelisted(addrs[i])).to.be.equal(true);
            }
            await this.RewardDelegationTopic.burn(addrs[3], toBN('1'));
            expect(await this.WhitelistRegistry.isWhitelisted(addrs[3])).to.be.equal(true);
            await this.WhitelistRegistry.register({
                from: addrs[MAX_WHITELISTED + 1],
            });
            expect(await this.WhitelistRegistry.isWhitelisted(addrs[MAX_WHITELISTED + 1])).to.be.equal(true);
            expect(await this.WhitelistRegistry.isWhitelisted(addrs[3])).to.be.equal(false);
        });

        it('should whitelist 10 addresses, then whitelist 9 times successfully', async () => {
            for (let i = 1; i <= MAX_WHITELISTED + 9; ++i) {
                await this.RewardDelegationTopic.mint(addrs[i], i <= MAX_WHITELISTED ? VOTING_POWER_THRESHOLD : VOTING_POWER_THRESHOLD.add(toBN('1')));
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
                await this.RewardDelegationTopic.mint(addrs[i], VOTING_POWER_THRESHOLD.addn(1));
                await this.WhitelistRegistry.register({ from: addrs[i] });
                expect(await this.WhitelistRegistry.isWhitelisted(addrs[i])).to.be.equal(true);
                if (i % 2 === 1) {
                    await this.RewardDelegationTopic.burn(addrs[i], VOTING_POWER_THRESHOLD);
                    await this.RewardDelegationTopic.mint(addrs[i - 1], VOTING_POWER_THRESHOLD);
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
                await this.RewardDelegationTopic.mint(addrs[i], VOTING_POWER_THRESHOLD);
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
                    await this.RewardDelegationTopic.mint(addrs[i], VOTING_POWER_THRESHOLD);
                    await this.WhitelistRegistry.register({ from: addrs[i] });
                }
                await expectAddrsInWhitelist(1, NEW_MAX_WHITELISTED);

                // add to whitelist additional addrs, total more than NEW_MAX_WHITELISTED
                await this.RewardDelegationTopic.mint(addrs[NEW_MAX_WHITELISTED + 1], VOTING_POWER_THRESHOLD);
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
                    await this.RewardDelegationTopic.mint(addrs[i], VOTING_POWER_THRESHOLD);
                    await this.WhitelistRegistry.register({ from: addrs[i] });
                }
                await expectAddrsInWhitelist(1, NEW_MAX_WHITELISTED);

                // add to whitelist additional addrs, total more than NEW_MAX_WHITELISTED
                await this.RewardDelegationTopic.mint(addrs[NEW_MAX_WHITELISTED + 1], VOTING_POWER_THRESHOLD);
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
                    await this.RewardDelegationTopic.mint(addrs[i], i === 2 ? 1 : i * 100);
                }
                await this.WhitelistRegistry.setMaxWhitelisted(this.whitelestedAmount - 1);
                await expectAddrsInWhitelist(1, this.whitelestedAmount, [2]);
            });

            it('should decrease max whitelist size', async () => {
                const NEW_MAX_WHITELISTED = this.whitelestedAmount - 1;
                await this.WhitelistRegistry.setMaxWhitelisted(NEW_MAX_WHITELISTED);

                // add to whitelist additional addr
                await this.RewardDelegationTopic.mint(addrs[this.whitelestedAmount + 1], VOTING_POWER_THRESHOLD);
                await expect(
                    this.WhitelistRegistry.register({
                        from: addrs[this.whitelestedAmount + 1],
                    }),
                ).to.eventually.be.rejectedWith('NotEnoughBalance()');
            });

            it('should remove addresses with least staking amount when addresses have random balances', async () => {
                await this.WhitelistRegistry.setMaxWhitelisted(MAX_WHITELISTED);
                for (let i = this.whitelestedAmount + 1; i <= MAX_WHITELISTED; ++i) {
                    await this.RewardDelegationTopic.mint(addrs[i], VOTING_POWER_THRESHOLD);
                    await this.WhitelistRegistry.register({ from: addrs[i] });
                }

                // make random amounts
                await this.RewardDelegationTopic.mint(addrs[1], ether('2'));
                await this.RewardDelegationTopic.mint(addrs[2], ether('11'));
                await this.RewardDelegationTopic.mint(addrs[3], ether('6'));
                await this.RewardDelegationTopic.mint(addrs[4], ether('3'));
                await this.RewardDelegationTopic.mint(addrs[5], ether('7'));
                await this.RewardDelegationTopic.mint(addrs[6], ether('1'));
                await this.RewardDelegationTopic.mint(addrs[7], ether('2'));
                await this.RewardDelegationTopic.mint(addrs[8], ether('6'));
                await this.RewardDelegationTopic.mint(addrs[9], ether('8'));
                await this.RewardDelegationTopic.mint(addrs[10], ether('2'));

                await this.WhitelistRegistry.setMaxWhitelisted(4);

                await expectAddrsInWhitelist(1, this.whitelestedAmount, [1, 3, 4, 6, 7, 10]);
            });
        });
    });
});
