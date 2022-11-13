const { expect, constants, ether } = require('@1inch/solidity-utils');
const { ethers } = require('hardhat');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const THRESHOLD = ether('1');
const VOTING_POWER_THRESHOLD = THRESHOLD * 2n;
const WHITELIST_LIMIT = 10;
const WHITELIST_SIZE = WHITELIST_LIMIT / 5;

describe('WhitelistRegistry', function () {
    let addrs;
    let st1inch;

    before(async function () {
        addrs = await ethers.getSigners();
        const St1inch = await ethers.getContractFactory('St1inch');
        st1inch = await St1inch.deploy(constants.ZERO_ADDRESS, 0, 0);
        await st1inch.deployed();
    });

    async function initContracts() {
        const RewardableDelegationPod = await ethers.getContractFactory(
            'RewardableDelegationPodWithVotingPowerMock',
        );
        const rewardableDelegationPod = await RewardableDelegationPod.deploy(
            'reward1INCH',
            'reward1INCH',
            st1inch.address,
        );
        await rewardableDelegationPod.deployed();
        const WhitelistRegistry = await ethers.getContractFactory('WhitelistRegistry');
        const whitelistRegistry = await WhitelistRegistry.deploy(
            rewardableDelegationPod.address,
            THRESHOLD,
            WHITELIST_LIMIT,
        );
        await whitelistRegistry.deployed();
        return { rewardableDelegationPod, whitelistRegistry };
    }

    describe('storage vars', function () {
        it('check storage vars', async function () {
            const { rewardableDelegationPod, whitelistRegistry } = await loadFixture(initContracts);
            expect(await whitelistRegistry.resolverThreshold()).to.equal(THRESHOLD);
            expect(await whitelistRegistry.whitelistLimit()).to.equal(WHITELIST_LIMIT);
            expect(await whitelistRegistry.token()).to.equal(rewardableDelegationPod.address);
        });
    });

    describe('setters', function () {
        it('threshold setter', async function () {
            const { whitelistRegistry } = await loadFixture(initContracts);
            await whitelistRegistry.setResolverThreshold(0);
            expect(await whitelistRegistry.resolverThreshold()).to.equal(0);
        });
    });

    describe('register', function () {
        it('should whitelist 10 addresses', async function () {
            const { rewardableDelegationPod, whitelistRegistry } = await loadFixture(initContracts);
            for (let i = 1; i <= WHITELIST_LIMIT; ++i) {
                await rewardableDelegationPod.mint(addrs[i].address, VOTING_POWER_THRESHOLD);
            }
            for (let i = 1; i <= WHITELIST_LIMIT; ++i) {
                await whitelistRegistry.connect(addrs[i]).register();
                expect(await whitelistRegistry.isWhitelisted(addrs[i].address)).to.equal(true);
            }
        });

        it('should fail to whitelist due to balance lower than threshold', async function () {
            const { whitelistRegistry } = await loadFixture(initContracts);
            await expect(whitelistRegistry.connect(addrs[1]).register()).to.be.revertedWithCustomError(
                whitelistRegistry,
                'BalanceLessThanThreshold',
            );
        });

        it('should whitelist 10 addresses, then fail to whitelist due to not enough balance, then whitelist successfully', async function () {
            const { rewardableDelegationPod, whitelistRegistry } = await loadFixture(initContracts);
            for (let i = 1; i <= WHITELIST_LIMIT + 1; ++i) {
                await rewardableDelegationPod.mint(addrs[i].address, VOTING_POWER_THRESHOLD);
            }
            for (let i = 1; i <= WHITELIST_LIMIT; ++i) {
                await whitelistRegistry.connect(addrs[i]).register();
                expect(await whitelistRegistry.isWhitelisted(addrs[i].address)).to.equal(true);
            }
            await expect(
                whitelistRegistry.connect(addrs[WHITELIST_LIMIT + 1]).register(),
            ).to.be.revertedWithCustomError(whitelistRegistry, 'NotEnoughBalance');
            expect(await whitelistRegistry.isWhitelisted(addrs[WHITELIST_LIMIT + 1].address)).to.equal(false);
            for (let i = 1; i <= WHITELIST_LIMIT; ++i) {
                await rewardableDelegationPod.burn(addrs[i].address, THRESHOLD);
                expect(await whitelistRegistry.isWhitelisted(addrs[i].address)).to.equal(true);
            }
            await rewardableDelegationPod.mint(addrs[WHITELIST_LIMIT + 1].address, THRESHOLD);
            await whitelistRegistry.connect(addrs[WHITELIST_LIMIT + 1]).register();
            expect(await whitelistRegistry.isWhitelisted(addrs[WHITELIST_LIMIT + 1].address)).to.equal(true);
            expect(await whitelistRegistry.isWhitelisted(addrs[1].address)).to.equal(false);
            for (let i = 2; i <= WHITELIST_LIMIT + 1; ++i) {
                expect(await whitelistRegistry.isWhitelisted(addrs[i].address)).to.equal(true);
            }
        });

        it('should whitelist 10 addresses, then lower balance, then whitelist successfully', async function () {
            const { rewardableDelegationPod, whitelistRegistry } = await loadFixture(initContracts);
            for (let i = 1; i <= WHITELIST_LIMIT + 1; ++i) {
                await rewardableDelegationPod.mint(addrs[i].address, VOTING_POWER_THRESHOLD);
            }
            for (let i = 1; i <= WHITELIST_LIMIT; ++i) {
                await whitelistRegistry.connect(addrs[i]).register();
                expect(await whitelistRegistry.isWhitelisted(addrs[i].address)).to.equal(true);
            }
            await rewardableDelegationPod.burn(addrs[3].address, 1);
            expect(await whitelistRegistry.isWhitelisted(addrs[3].address)).to.equal(true);
            await whitelistRegistry.connect(addrs[WHITELIST_LIMIT + 1]).register();
            expect(await whitelistRegistry.isWhitelisted(addrs[WHITELIST_LIMIT + 1].address)).to.equal(true);
            expect(await whitelistRegistry.isWhitelisted(addrs[3].address)).to.equal(false);
        });

        it('should whitelist 10 addresses, then whitelist 9 times successfully', async function () {
            const { rewardableDelegationPod, whitelistRegistry } = await loadFixture(initContracts);
            for (let i = 1; i <= WHITELIST_LIMIT + 9; ++i) {
                await rewardableDelegationPod.mint(
                    addrs[i].address,
                    i <= WHITELIST_LIMIT ? VOTING_POWER_THRESHOLD : VOTING_POWER_THRESHOLD + 1n,
                );
            }
            for (let i = 1; i <= WHITELIST_LIMIT + 9; ++i) {
                await whitelistRegistry.connect(addrs[i]).register();
                expect(await whitelistRegistry.isWhitelisted(addrs[i].address)).to.equal(true);
            }
            let whitelisted = 0;
            for (let i = 1; i <= WHITELIST_LIMIT; ++i) {
                whitelisted += await whitelistRegistry.isWhitelisted(addrs[i].address);
            }
            expect(whitelisted).to.equal(1);
        });
    });

    describe('clean', function () {
        it('should remove from whitelist addresses which not enough staked balance', async function () {
            const { rewardableDelegationPod, whitelistRegistry } = await loadFixture(initContracts);
            for (let i = 0; i < WHITELIST_LIMIT; ++i) {
                await rewardableDelegationPod.mint(addrs[i].address, VOTING_POWER_THRESHOLD + 1n);
                await whitelistRegistry.connect(addrs[i]).register();
                expect(await whitelistRegistry.isWhitelisted(addrs[i].address)).to.equal(true);
                if (i % 2 === 1) {
                    await rewardableDelegationPod.burn(addrs[i].address, VOTING_POWER_THRESHOLD);
                    await rewardableDelegationPod.mint(addrs[i - 1].address, VOTING_POWER_THRESHOLD);
                }
            }
            await whitelistRegistry.clean();
            for (let i = 0; i < WHITELIST_LIMIT; ++i) {
                if (i % 2 === 1) {
                    expect(await whitelistRegistry.isWhitelisted(addrs[i].address)).to.equal(false);
                } else {
                    expect(await whitelistRegistry.isWhitelisted(addrs[i].address)).to.equal(true);
                }
            }
        });
    });

    async function setupRegistry() {
        const { rewardableDelegationPod, whitelistRegistry } = await initContracts();
        for (let i = 1; i <= WHITELIST_SIZE; ++i) {
            await rewardableDelegationPod.mint(addrs[i].address, VOTING_POWER_THRESHOLD);
            await whitelistRegistry.connect(addrs[i]).register();
        }
        return { rewardableDelegationPod, whitelistRegistry };
    }

    describe('setWhitelistLimit', function () {
        async function expectAddrsInWhitelist(whitelistRegistry, indexFrom, indexTo, except = []) {
            for (let i = indexFrom; i <= indexTo; i++) {
                if (except.indexOf(i) !== -1) {
                    expect(await whitelistRegistry.isWhitelisted(addrs[i].address)).to.be.equal(false);
                } else {
                    expect(await whitelistRegistry.isWhitelisted(addrs[i].address)).to.be.equal(true);
                }
            }
        };

        describe('increase more than current max whitelist size', function () {
            it('should not change whitelist', async function () {
                const { whitelistRegistry } = await loadFixture(setupRegistry);
                await whitelistRegistry.setWhitelistLimit(WHITELIST_LIMIT + 1);
                await expectAddrsInWhitelist(whitelistRegistry, 1, WHITELIST_SIZE);
            });

            it('should increase max whitelist size', async function () {
                const { rewardableDelegationPod, whitelistRegistry } = await loadFixture(setupRegistry);

                const NEW_WHITELIST_LIMIT = WHITELIST_LIMIT + 1;
                await whitelistRegistry.setWhitelistLimit(NEW_WHITELIST_LIMIT);

                // add to whitelist additional addrs, total more than initially WHITELIST_LIMIT
                for (let i = WHITELIST_SIZE + 1; i <= NEW_WHITELIST_LIMIT; ++i) {
                    await rewardableDelegationPod.mint(addrs[i].address, VOTING_POWER_THRESHOLD);
                    await whitelistRegistry.connect(addrs[i]).register();
                }
                await expectAddrsInWhitelist(whitelistRegistry, 1, NEW_WHITELIST_LIMIT);

                // add to whitelist additional addrs, total more than NEW_WHITELIST_LIMIT
                await rewardableDelegationPod.mint(addrs[NEW_WHITELIST_LIMIT + 1].address, VOTING_POWER_THRESHOLD);
                await expect(
                    whitelistRegistry.connect(addrs[NEW_WHITELIST_LIMIT + 1]).register(),
                ).to.eventually.be.rejectedWith('NotEnoughBalance()');
            });
        });

        describe('decrease but stay more than whitelisted amount', function () {
            it('should not change whitelist ', async function () {
                const { whitelistRegistry } = await loadFixture(setupRegistry);
                await whitelistRegistry.setWhitelistLimit(WHITELIST_SIZE + 1);
                await expectAddrsInWhitelist(whitelistRegistry, 1, WHITELIST_SIZE);
            });

            it('should decrease max whitelist size', async function () {
                const { rewardableDelegationPod, whitelistRegistry } = await loadFixture(setupRegistry);
                const NEW_WHITELIST_LIMIT = WHITELIST_LIMIT - 1;
                await whitelistRegistry.setWhitelistLimit(NEW_WHITELIST_LIMIT);

                // add to whitelist additional addrs, total NEW_WHITELIST_LIMIT
                for (let i = WHITELIST_SIZE + 1; i <= NEW_WHITELIST_LIMIT; ++i) {
                    await rewardableDelegationPod.mint(addrs[i].address, VOTING_POWER_THRESHOLD);
                    await whitelistRegistry.connect(addrs[i]).register();
                }
                await expectAddrsInWhitelist(whitelistRegistry, 1, NEW_WHITELIST_LIMIT);

                // add to whitelist additional addrs, total more than NEW_WHITELIST_LIMIT
                await rewardableDelegationPod.mint(addrs[NEW_WHITELIST_LIMIT + 1].address, VOTING_POWER_THRESHOLD);
                await expect(
                    whitelistRegistry.connect(addrs[NEW_WHITELIST_LIMIT + 1]).register(),
                ).to.be.revertedWithCustomError(whitelistRegistry, 'NotEnoughBalance');
            });
        });

        describe('decrease less than whitelisted amount', function () {
            it('should remove last added addresses when staking balances are equals', async function () {
                const { whitelistRegistry } = await loadFixture(setupRegistry);
                await whitelistRegistry.setWhitelistLimit(WHITELIST_SIZE - 1);
                await expectAddrsInWhitelist(whitelistRegistry, 1, WHITELIST_SIZE, [WHITELIST_SIZE]);
            });

            it('should remove addresses with least staking amount', async function () {
                const { rewardableDelegationPod, whitelistRegistry } = await loadFixture(setupRegistry);
                // make the addrs[2] with the least balance
                for (let i = 1; i <= WHITELIST_SIZE; i++) {
                    await rewardableDelegationPod.mint(addrs[i].address, i === 2 ? 1 : i * 100);
                }
                await whitelistRegistry.setWhitelistLimit(WHITELIST_SIZE - 1);
                await expectAddrsInWhitelist(whitelistRegistry, 1, WHITELIST_SIZE, [2]);
            });

            it('should decrease max whitelist size', async function () {
                const { rewardableDelegationPod, whitelistRegistry } = await loadFixture(setupRegistry);

                const NEW_WHITELIST_LIMIT = WHITELIST_SIZE - 1;
                await whitelistRegistry.setWhitelistLimit(NEW_WHITELIST_LIMIT);

                // add to whitelist additional addr
                await rewardableDelegationPod.mint(addrs[WHITELIST_SIZE + 1].address, VOTING_POWER_THRESHOLD);
                await expect(
                    whitelistRegistry.connect(addrs[NEW_WHITELIST_LIMIT + 1]).register(),
                ).to.be.revertedWithCustomError(whitelistRegistry, 'NotEnoughBalance');
            });

            it('should remove addresses with least staking amount when addresses have random balances', async function () {
                const { rewardableDelegationPod, whitelistRegistry } = await loadFixture(setupRegistry);

                await whitelistRegistry.setWhitelistLimit(WHITELIST_LIMIT);
                for (let i = WHITELIST_SIZE + 1; i <= WHITELIST_LIMIT; ++i) {
                    await rewardableDelegationPod.mint(addrs[i].address, VOTING_POWER_THRESHOLD);
                    await whitelistRegistry.connect(addrs[i]).register();
                }

                // make random amounts
                await rewardableDelegationPod.mint(addrs[1].address, ether('2'));
                await rewardableDelegationPod.mint(addrs[2].address, ether('11'));
                await rewardableDelegationPod.mint(addrs[3].address, ether('6'));
                await rewardableDelegationPod.mint(addrs[4].address, ether('3'));
                await rewardableDelegationPod.mint(addrs[5].address, ether('7'));
                await rewardableDelegationPod.mint(addrs[6].address, ether('1'));
                await rewardableDelegationPod.mint(addrs[7].address, ether('2'));
                await rewardableDelegationPod.mint(addrs[8].address, ether('6'));
                await rewardableDelegationPod.mint(addrs[9].address, ether('8'));
                await rewardableDelegationPod.mint(addrs[10].address, ether('2'));

                await whitelistRegistry.setWhitelistLimit(4);

                await expectAddrsInWhitelist(whitelistRegistry, 1, WHITELIST_SIZE, [1, 3, 4, 6, 7, 10]);
            });
        });
    });
});
