const { expect, constants } = require('@1inch/solidity-utils');
const { ethers } = require('hardhat');
const { ether } = require('./helpers/orderUtils');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const THRESHOLD = ether('1');
const VOTING_POWER_THRESHOLD = THRESHOLD.mul(2);
const MAX_WHITELISTED = 10;

describe('WhitelistRegistry', async () => {
    let addrs;
    let st1inch;

    before(async () => {
        addrs = await ethers.getSigners();
        const St1inch = await ethers.getContractFactory('St1inch');
        st1inch = await St1inch.deploy(constants.ZERO_ADDRESS, 0, 0, 0);
        await st1inch.deployed();
    });

    async function initContracts() {
        const RewardableDelegationTopic = await ethers.getContractFactory(
            'RewardableDelegationTopicWithVotingPowerMock',
        );
        const rewardDelegationTopic = await RewardableDelegationTopic.deploy(
            'reward1INCH',
            'reward1INCH',
            st1inch.address,
        );
        await rewardDelegationTopic.deployed();
        const WhitelistRegistry = await ethers.getContractFactory('WhitelistRegistry');
        const whitelistRegistry = await WhitelistRegistry.deploy(
            rewardDelegationTopic.address,
            THRESHOLD,
            MAX_WHITELISTED,
        );
        await whitelistRegistry.deployed();
        return { rewardDelegationTopic, whitelistRegistry };
    }

    describe('storage vars', async () => {
        it('check storage vars', async () => {
            const { rewardDelegationTopic, whitelistRegistry } = await loadFixture(initContracts);
            expect(await whitelistRegistry.resolverThreshold()).to.equal(THRESHOLD);
            expect(await whitelistRegistry.maxWhitelisted()).to.equal(MAX_WHITELISTED);
            expect(await whitelistRegistry.token()).to.equal(rewardDelegationTopic.address);
        });
    });

    describe('setters', async () => {
        it('threshold setter', async () => {
            const { whitelistRegistry } = await loadFixture(initContracts);
            await whitelistRegistry.setResolverThreshold(0);
            expect(await whitelistRegistry.resolverThreshold()).to.equal(0);
        });
    });

    describe('register', async () => {
        it('should whitelist 10 addresses', async () => {
            const { rewardDelegationTopic, whitelistRegistry } = await loadFixture(initContracts);
            for (let i = 1; i <= MAX_WHITELISTED; ++i) {
                await rewardDelegationTopic.mint(addrs[i].address, VOTING_POWER_THRESHOLD);
            }
            for (let i = 1; i <= MAX_WHITELISTED; ++i) {
                await whitelistRegistry.connect(addrs[i]).register();
                expect(await whitelistRegistry.isWhitelisted(addrs[i].address)).to.equal(true);
            }
        });

        it('should fail to whitelist due to balance lower than threshold', async () => {
            const { whitelistRegistry } = await loadFixture(initContracts);
            await expect(whitelistRegistry.connect(addrs[1]).register()).to.be.revertedWithCustomError(
                whitelistRegistry,
                'BalanceLessThanThreshold',
            );
        });

        it('should whitelist 10 addresses, then fail to whitelist due to not enough balance, then whitelist successfully', async () => {
            const { rewardDelegationTopic, whitelistRegistry } = await loadFixture(initContracts);
            for (let i = 1; i <= MAX_WHITELISTED + 1; ++i) {
                await rewardDelegationTopic.mint(addrs[i].address, VOTING_POWER_THRESHOLD);
            }
            for (let i = 1; i <= MAX_WHITELISTED; ++i) {
                await whitelistRegistry.connect(addrs[i]).register();
                expect(await whitelistRegistry.isWhitelisted(addrs[i].address)).to.equal(true);
            }
            await expect(
                whitelistRegistry.connect(addrs[MAX_WHITELISTED + 1]).register(),
            ).to.be.revertedWithCustomError(whitelistRegistry, 'NotEnoughBalance');
            expect(await whitelistRegistry.isWhitelisted(addrs[MAX_WHITELISTED + 1].address)).to.equal(false);
            for (let i = 1; i <= MAX_WHITELISTED; ++i) {
                await rewardDelegationTopic.burn(addrs[i].address, THRESHOLD);
                expect(await whitelistRegistry.isWhitelisted(addrs[i].address)).to.equal(true);
            }
            await rewardDelegationTopic.mint(addrs[MAX_WHITELISTED + 1].address, THRESHOLD);
            await whitelistRegistry.connect(addrs[MAX_WHITELISTED + 1]).register();
            expect(await whitelistRegistry.isWhitelisted(addrs[MAX_WHITELISTED + 1].address)).to.equal(true);
            expect(await whitelistRegistry.isWhitelisted(addrs[1].address)).to.equal(false);
            for (let i = 2; i <= MAX_WHITELISTED + 1; ++i) {
                expect(await whitelistRegistry.isWhitelisted(addrs[i].address)).to.equal(true);
            }
        });

        it('should whitelist 10 addresses, then lower balance, then whitelist successfully', async () => {
            const { rewardDelegationTopic, whitelistRegistry } = await loadFixture(initContracts);
            for (let i = 1; i <= MAX_WHITELISTED + 1; ++i) {
                await rewardDelegationTopic.mint(addrs[i].address, VOTING_POWER_THRESHOLD);
            }
            for (let i = 1; i <= MAX_WHITELISTED; ++i) {
                await whitelistRegistry.connect(addrs[i]).register();
                expect(await whitelistRegistry.isWhitelisted(addrs[i].address)).to.equal(true);
            }
            await rewardDelegationTopic.burn(addrs[3].address, 1);
            expect(await whitelistRegistry.isWhitelisted(addrs[3].address)).to.equal(true);
            await whitelistRegistry.connect(addrs[MAX_WHITELISTED + 1]).register();
            expect(await whitelistRegistry.isWhitelisted(addrs[MAX_WHITELISTED + 1].address)).to.equal(true);
            expect(await whitelistRegistry.isWhitelisted(addrs[3].address)).to.equal(false);
        });

        it('should whitelist 10 addresses, then whitelist 9 times successfully', async () => {
            const { rewardDelegationTopic, whitelistRegistry } = await loadFixture(initContracts);
            for (let i = 1; i <= MAX_WHITELISTED + 9; ++i) {
                await rewardDelegationTopic.mint(
                    addrs[i].address,
                    i <= MAX_WHITELISTED ? VOTING_POWER_THRESHOLD : VOTING_POWER_THRESHOLD.add(1),
                );
            }
            for (let i = 1; i <= MAX_WHITELISTED + 9; ++i) {
                await whitelistRegistry.connect(addrs[i]).register();
                expect(await whitelistRegistry.isWhitelisted(addrs[i].address)).to.equal(true);
            }
            let whitelisted = 0;
            for (let i = 1; i <= MAX_WHITELISTED; ++i) {
                whitelisted += await whitelistRegistry.isWhitelisted(addrs[i].address);
            }
            expect(whitelisted).to.equal(1);
        });
    });

    describe('clean', async () => {
        it('should remove from whitelist addresses which not enough staked balance', async () => {
            const { rewardDelegationTopic, whitelistRegistry } = await loadFixture(initContracts);
            for (let i = 0; i < MAX_WHITELISTED; ++i) {
                await rewardDelegationTopic.mint(addrs[i].address, VOTING_POWER_THRESHOLD.add(1));
                await whitelistRegistry.connect(addrs[i]).register();
                expect(await whitelistRegistry.isWhitelisted(addrs[i].address)).to.equal(true);
                if (i % 2 === 1) {
                    await rewardDelegationTopic.burn(addrs[i].address, VOTING_POWER_THRESHOLD);
                    await rewardDelegationTopic.mint(addrs[i - 1].address, VOTING_POWER_THRESHOLD);
                }
            }
            await whitelistRegistry.clean();
            for (let i = 0; i < MAX_WHITELISTED; ++i) {
                if (i % 2 === 1) {
                    expect(await whitelistRegistry.isWhitelisted(addrs[i].address)).to.equal(false);
                } else {
                    expect(await whitelistRegistry.isWhitelisted(addrs[i].address)).to.equal(true);
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
