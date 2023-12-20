const { expect, constants, ether, deployContract } = require('@1inch/solidity-utils');
const { ethers } = require('hardhat');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { expBase } = require('./helpers/fusionUtils');

const BASIS_POINTS = 10000; // 100%
const PERCENTAGE_THRESHOLD = 1000; // 10%
const RESOLVER_BALANCE = ether('0.1');
const WHITELIST_LIMIT = Math.floor(BASIS_POINTS / PERCENTAGE_THRESHOLD);
const MINT_COEFFICIENTS = [20, 26, 1, 5, 15, 1, 10, 1, 20, 1];

describe('WhitelistRegistry', function () {
    async function expectAddrsInWhitelist(whitelistRegistry, accounts, indexFrom, indexTo, except = []) {
        const whitelist = await whitelistRegistry.getWhitelist();
        for (let i = indexFrom; i <= indexTo; i++) {
            if (except.indexOf(i) !== -1) {
                expect(whitelist).to.not.contain(accounts[i].address);
            } else {
                expect(whitelist).to.contain(accounts[i].address);
            }
        }
    };

    async function initContracts() {
        const accounts = await ethers.getSigners();
        const st1inch = await deployContract('St1inch', [constants.ZERO_ADDRESS, expBase, accounts[0]]);
        const rewardableDelegationPod = await deployContract('PowerPodMock', ['reward1INCH', 'reward1INCH', st1inch]);
        const whitelistRegistry = await deployContract('WhitelistRegistry', [rewardableDelegationPod, PERCENTAGE_THRESHOLD]);
        return {
            contracts: { rewardableDelegationPod, whitelistRegistry },
            accounts,
        };
    }

    describe('storage vars', function () {
        it('check storage vars', async function () {
            const { contracts: { rewardableDelegationPod, whitelistRegistry } } = await loadFixture(initContracts);
            expect(await whitelistRegistry.resolverPercentageThreshold()).to.equal(PERCENTAGE_THRESHOLD);
            expect(await whitelistRegistry.TOKEN()).to.equal(await rewardableDelegationPod.getAddress());
        });
    });

    describe('setters', function () {
        it('percentage threshold setter', async function () {
            const { contracts: { whitelistRegistry } } = await loadFixture(initContracts);
            const newThreshold = 100; // 1%
            await whitelistRegistry.setResolverPercentageThreshold(newThreshold);
            expect(await whitelistRegistry.resolverPercentageThreshold()).to.equal(newThreshold);
        });

        it('percentage threshold setter works only for the owner', async function () {
            const { contracts: { whitelistRegistry }, accounts } = await loadFixture(initContracts);
            const newThreshold = 100; // 1%
            await expect(
                whitelistRegistry.connect(accounts[1]).setResolverPercentageThreshold(newThreshold),
            ).to.be.revertedWithCustomError(whitelistRegistry, 'OwnableUnauthorizedAccount');
            expect(await whitelistRegistry.resolverPercentageThreshold()).to.equal(PERCENTAGE_THRESHOLD);
        });
    });

    describe('rescueFunds', function () {
        it('should rescue funds', async function () {
            const { contracts: { whitelistRegistry }, accounts } = await loadFixture(initContracts);
            const amount = '0x100';
            await ethers.provider.send('hardhat_setBalance', [
                await whitelistRegistry.getAddress(),
                amount,
            ]);
            expect(await ethers.provider.getBalance(whitelistRegistry)).to.be.equal(amount);
            const tx = whitelistRegistry.rescueFunds(constants.ZERO_ADDRESS, amount / 2);
            await expect(tx).to.changeEtherBalance(accounts[0], amount / 2);
            expect(await ethers.provider.getBalance(whitelistRegistry)).to.be.equal(amount / 2);
        });

        it('should not rescue funds by non-owner', async function () {
            const { contracts: { whitelistRegistry }, accounts } = await loadFixture(initContracts);
            const amount = '0x100';
            await ethers.provider.send('hardhat_setBalance', [
                await whitelistRegistry.getAddress(),
                amount,
            ]);
            expect(await ethers.provider.getBalance(whitelistRegistry)).to.be.equal(amount);
            await expect(
                whitelistRegistry.connect(accounts[1]).rescueFunds(constants.ZERO_ADDRESS, amount / 2),
            ).to.be.revertedWithCustomError(whitelistRegistry, 'OwnableUnauthorizedAccount');
            expect(await ethers.provider.getBalance(whitelistRegistry)).to.be.equal(amount);
        });
    });

    describe('register', function () {
        describe('should whitelist', function () {
            it('10 addresses', async function () {
                const { contracts: { rewardableDelegationPod, whitelistRegistry }, accounts } = await loadFixture(initContracts);
                expect(await rewardableDelegationPod.totalSupply()).to.equal(0);
                for (let i = 1; i <= WHITELIST_LIMIT; ++i) {
                    await rewardableDelegationPod.mint(accounts[i], RESOLVER_BALANCE);
                }
                for (let i = 1; i <= WHITELIST_LIMIT; ++i) {
                    await whitelistRegistry.connect(accounts[i]).register();
                    expect(await whitelistRegistry.getWhitelist()).to.contain(accounts[i].address);
                }
            });

            it('10/10 addresses, then fail to whitelist due to not enough balance, then move power and whitelist successfully', async function () {
                const { contracts: { rewardableDelegationPod, whitelistRegistry }, accounts } = await loadFixture(initContracts);
                for (let i = 1; i <= WHITELIST_LIMIT; ++i) {
                    await rewardableDelegationPod.mint(accounts[i], RESOLVER_BALANCE);
                }
                for (let i = 1; i <= WHITELIST_LIMIT; ++i) {
                    await whitelistRegistry.connect(accounts[i]).register();
                    expect(await whitelistRegistry.getWhitelist()).to.contain(accounts[i].address);
                }
                await expect(
                    whitelistRegistry.connect(accounts[WHITELIST_LIMIT + 1]).register(),
                ).to.be.revertedWithCustomError(whitelistRegistry, 'BalanceLessThanThreshold');
                expect(await whitelistRegistry.getWhitelist()).to.not.contain(accounts[WHITELIST_LIMIT + 1].address);

                await rewardableDelegationPod.burn(accounts[1], RESOLVER_BALANCE);
                await rewardableDelegationPod.mint(accounts[WHITELIST_LIMIT + 1], RESOLVER_BALANCE);

                await whitelistRegistry.connect(accounts[WHITELIST_LIMIT + 1]).register();
                const whitelist = await whitelistRegistry.getWhitelist();
                expect(whitelist).to.contain(accounts[WHITELIST_LIMIT + 1].address);
                await expectAddrsInWhitelist(whitelistRegistry, 1, WHITELIST_LIMIT + 1, [1]);
            });

            it('5/10 addresses, then lower balance, then whitelist +1 successfully', async function () {
                const { contracts: { rewardableDelegationPod, whitelistRegistry }, accounts } = await loadFixture(initContracts);
                const resolversNumber = WHITELIST_LIMIT / 2;
                for (let i = 1; i <= resolversNumber; ++i) {
                    await rewardableDelegationPod.mint(accounts[i], RESOLVER_BALANCE);
                }
                for (let i = 1; i <= resolversNumber; ++i) {
                    await whitelistRegistry.connect(accounts[i]).register();
                    expect(await whitelistRegistry.getWhitelist()).to.contain(accounts[i].address);
                }
                await rewardableDelegationPod.burn(accounts[3], RESOLVER_BALANCE / 2n);
                expect(await whitelistRegistry.getWhitelist()).to.contain(accounts[3].address);
                await whitelistRegistry.clean();
                expect(await whitelistRegistry.getWhitelist()).to.contain(accounts[3].address);
                await rewardableDelegationPod.mint(accounts[resolversNumber + 1], RESOLVER_BALANCE / 2n);
                await whitelistRegistry.connect(accounts[resolversNumber + 1]).register();
                const whitelist = await whitelistRegistry.getWhitelist();
                expect(whitelist).to.contain(accounts[3].address);
                expect(whitelist).to.contain(accounts[resolversNumber + 1].address);
            });

            it('5/10 addresses, then lower balance, then whitelist instead successfully', async function () {
                const { contracts: { rewardableDelegationPod, whitelistRegistry }, accounts } = await loadFixture(initContracts);
                const resolversNumber = WHITELIST_LIMIT / 2;
                for (let i = 1; i <= resolversNumber; ++i) {
                    await rewardableDelegationPod.mint(accounts[i], RESOLVER_BALANCE);
                }
                for (let i = 1; i <= resolversNumber; ++i) {
                    await whitelistRegistry.connect(accounts[i]).register();
                    expect(await whitelistRegistry.getWhitelist()).to.contain(accounts[i].address);
                }
                await rewardableDelegationPod.burn(accounts[3], RESOLVER_BALANCE / 4n * 3n);
                expect(await whitelistRegistry.getWhitelist()).to.contain(accounts[3].address);
                await whitelistRegistry.clean();
                expect(await whitelistRegistry.getWhitelist()).to.not.contain(accounts[3].address);
                await rewardableDelegationPod.mint(accounts[resolversNumber + 1], RESOLVER_BALANCE / 2n);
                await whitelistRegistry.connect(accounts[resolversNumber + 1]).register();
                await expect(
                    whitelistRegistry.connect(accounts[3]).register(),
                ).to.be.revertedWithCustomError(whitelistRegistry, 'BalanceLessThanThreshold');
                const whitelist = await whitelistRegistry.getWhitelist();
                expect(whitelist).to.contain(accounts[resolversNumber + 1].address);
                expect(whitelist).to.not.contain(accounts[3].address);
            });
        });

        describe('should fail to whitelist', function () {
            it('due to zero balance', async function () {
                const { contracts: { rewardableDelegationPod, whitelistRegistry }, accounts } = await loadFixture(initContracts);
                expect(await rewardableDelegationPod.balanceOf(accounts[1])).to.be.equal(0n);
                await expect(whitelistRegistry.connect(accounts[1]).register()).to.be.revertedWithCustomError(
                    whitelistRegistry,
                    'BalanceLessThanThreshold',
                );
                expect(await whitelistRegistry.getWhitelist()).to.be.empty;
            });

            it('due to percentage lower than threshold', async function () {
                const { contracts: { rewardableDelegationPod, whitelistRegistry }, accounts } = await loadFixture(initContracts);
                // increasing total supply to avoid multiplying by zero
                await rewardableDelegationPod.mint(accounts[0], RESOLVER_BALANCE);
                await expect(whitelistRegistry.connect(accounts[1]).register()).to.be.revertedWithCustomError(
                    whitelistRegistry,
                    'BalanceLessThanThreshold',
                );
            });

            it('the same address twice', async function () {
                const { contracts: { rewardableDelegationPod, whitelistRegistry }, accounts } = await loadFixture(initContracts);
                await rewardableDelegationPod.mint(accounts[1], RESOLVER_BALANCE);
                await whitelistRegistry.connect(accounts[1]).register();
                await expect(whitelistRegistry.connect(accounts[1]).register()).to.be.revertedWithCustomError(
                    whitelistRegistry,
                    'AlreadyRegistered',
                );
            });
        });
    });

    describe('promote', function () {
        it('should register and promote provided address', async function () {
            const { contracts: { rewardableDelegationPod, whitelistRegistry }, accounts } = await loadFixture(initContracts);
            await rewardableDelegationPod.mint(accounts[0], RESOLVER_BALANCE);
            await whitelistRegistry.register();
            await whitelistRegistry.promote(1, accounts[1]);
            const promotees = await whitelistRegistry.getPromotees(1);
            expect(promotees).to.not.contain(accounts[0].address);
            expect(promotees).to.contain(accounts[1].address);
        });

        it('should change promotee', async function () {
            const { contracts: { rewardableDelegationPod, whitelistRegistry }, accounts } = await loadFixture(initContracts);
            await rewardableDelegationPod.mint(accounts[0], RESOLVER_BALANCE);
            await whitelistRegistry.register();
            expect(await whitelistRegistry.getWhitelist()).to.contain(accounts[0].address);
            await expect(
                whitelistRegistry.promote(1, accounts[1]),
            ).to.emit(whitelistRegistry, 'Promotion').withArgs(accounts[0].address, 1, accounts[1].address);
            let promotees = await whitelistRegistry.getPromotees(1);
            expect(promotees).to.not.contain(accounts[0].address);
            expect(promotees).to.contain(accounts[1].address);
            await expect(
                whitelistRegistry.promote(1, accounts[2]),
            ).to.emit(whitelistRegistry, 'Promotion').withArgs(accounts[0].address, 1, accounts[2].address);
            promotees = await whitelistRegistry.getPromotees(1);
            expect(promotees).to.not.contain(accounts[1].address);
            expect(promotees).to.contain(accounts[2].address);
        });

        it('should delete promotee on removal', async function () {
            const { contracts: { rewardableDelegationPod, whitelistRegistry }, accounts } = await loadFixture(initContracts);
            await rewardableDelegationPod.mint(accounts[0], RESOLVER_BALANCE);
            await whitelistRegistry.register();
            await whitelistRegistry.promote(1, accounts[1]);
            await rewardableDelegationPod.mint(accounts[2], RESOLVER_BALANCE * BigInt(WHITELIST_LIMIT));
            await whitelistRegistry.clean();
            const promotees = await whitelistRegistry.getPromotees(1);
            expect(promotees).to.not.contain(accounts[0].address);
            expect(promotees).to.not.contain(accounts[1].address);
        });

        it('should not register the same promote twice', async function () {
            const { contracts: { rewardableDelegationPod, whitelistRegistry }, accounts } = await loadFixture(initContracts);
            await rewardableDelegationPod.mint(accounts[0], RESOLVER_BALANCE);
            await whitelistRegistry.register();
            await whitelistRegistry.promote(1, accounts[1]);
            const promotees = await whitelistRegistry.getPromotees(1);
            expect(promotees).to.not.contain(accounts[0].address);
            expect(promotees).to.contain(accounts[1].address);

            await expect(
                whitelistRegistry.promote(1, accounts[1]),
            ).to.be.revertedWithCustomError(whitelistRegistry, 'SamePromotee');
        });
    });

    describe('clean', function () {
        it('should remove from whitelist addresses which have not enough staked balance', async function () {
            const { contracts: { rewardableDelegationPod, whitelistRegistry }, accounts } = await loadFixture(initContracts);
            for (let i = 0; i < WHITELIST_LIMIT; ++i) {
                await rewardableDelegationPod.mint(accounts[i], RESOLVER_BALANCE);
                await whitelistRegistry.connect(accounts[i]).register();
                expect(await whitelistRegistry.getWhitelist()).to.contain(accounts[i].address);
                if (i % 2 === 1) {
                    await rewardableDelegationPod.burn(accounts[i], RESOLVER_BALANCE);
                    await rewardableDelegationPod.mint(accounts[i - 1], RESOLVER_BALANCE);
                }
            }
            await whitelistRegistry.clean();
            const whitelist = await whitelistRegistry.getWhitelist();
            for (let i = 0; i < WHITELIST_LIMIT; ++i) {
                if (i % 2 === 1) {
                    expect(whitelist).to.not.contain(accounts[i].address);
                } else {
                    expect(whitelist).to.contain(accounts[i].address);
                }
            }
        });

        it('should not remove from whitelist addresses which have enough staked balance', async function () {
            const { contracts: { rewardableDelegationPod, whitelistRegistry }, accounts } = await loadFixture(initContracts);
            for (let i = 0; i < WHITELIST_LIMIT; ++i) {
                await rewardableDelegationPod.mint(accounts[i], RESOLVER_BALANCE);
                await whitelistRegistry.connect(accounts[i]).register();
                expect(await whitelistRegistry.getWhitelist()).to.contain(accounts[i].address);
            }
            await whitelistRegistry.clean();
            await expectAddrsInWhitelist(whitelistRegistry, 0, WHITELIST_LIMIT - 1);
        });

        it('should remove from whitelist addresses with zero balance', async function () {
            const { contracts: { rewardableDelegationPod, whitelistRegistry }, accounts } = await loadFixture(initContracts);
            for (let i = 0; i < WHITELIST_LIMIT; ++i) {
                await rewardableDelegationPod.mint(accounts[i], RESOLVER_BALANCE);
                await whitelistRegistry.connect(accounts[i]).register();
                expect(await whitelistRegistry.getWhitelist()).to.contain(accounts[i].address);
            }
            for (let i = 0; i < WHITELIST_LIMIT; ++i) {
                await rewardableDelegationPod.burn(accounts[i], RESOLVER_BALANCE);
            }
            await whitelistRegistry.clean();
            expect(await whitelistRegistry.getWhitelist()).to.be.empty;
        });

        it('should not fail due to zero total supply', async function () {
            const { contracts: { rewardableDelegationPod, whitelistRegistry } } = await loadFixture(initContracts);
            expect(await rewardableDelegationPod.totalSupply()).to.be.equal(0n);
            await whitelistRegistry.clean();
            expect(await whitelistRegistry.getWhitelist()).to.be.empty;
        });
    });

    async function setupRegistry() {
        const { contracts: { rewardableDelegationPod, whitelistRegistry }, accounts } = await initContracts();
        for (let i = 0; i < MINT_COEFFICIENTS.length; ++i) {
            await rewardableDelegationPod.mint(accounts[i], RESOLVER_BALANCE * BigInt(MINT_COEFFICIENTS[i]) / 100n);
            if (MINT_COEFFICIENTS[i] * BASIS_POINTS / 100 >= PERCENTAGE_THRESHOLD) {
                await whitelistRegistry.connect(accounts[i]).register();
            }
        }
        return { contracts: { rewardableDelegationPod, whitelistRegistry }, accounts };
    }

    describe('setResolverPercentageThreshold', function () {
        describe('increase more than current resolver percentage threshold', function () {
            it('should not change whitelist without clean', async function () {
                const { contracts: { whitelistRegistry } } = await loadFixture(setupRegistry);
                const newResolverPercentageThreshold = PERCENTAGE_THRESHOLD * 2;
                await whitelistRegistry.setResolverPercentageThreshold(newResolverPercentageThreshold);
                await expectAddrsInWhitelist(
                    whitelistRegistry,
                    0,
                    MINT_COEFFICIENTS.length - 1,
                    MINT_COEFFICIENTS.map((e, i) => e * BASIS_POINTS / 100 < PERCENTAGE_THRESHOLD ? i : '').filter(String),
                );
            });
            it('should remove addresses with least staking percentage with clean', async function () {
                const { contracts: { whitelistRegistry } } = await loadFixture(setupRegistry);
                const newResolverPercentageThreshold = PERCENTAGE_THRESHOLD * 2;
                await whitelistRegistry.setResolverPercentageThreshold(newResolverPercentageThreshold);
                await whitelistRegistry.clean();
                await expectAddrsInWhitelist(
                    whitelistRegistry,
                    0,
                    MINT_COEFFICIENTS.length - 1,
                    MINT_COEFFICIENTS.map((e, i) => e * BASIS_POINTS / 100 < newResolverPercentageThreshold ? i : '').filter(String),
                );
            });
        });

        describe('decrease less than current resolver percentage threshold', function () {
            it('should not change whitelist without clean', async function () {
                const { contracts: { whitelistRegistry } } = await loadFixture(setupRegistry);
                const newResolverPercentageThreshold = PERCENTAGE_THRESHOLD / 2;
                await whitelistRegistry.setResolverPercentageThreshold(newResolverPercentageThreshold);
                await expectAddrsInWhitelist(
                    whitelistRegistry,
                    0,
                    MINT_COEFFICIENTS.length - 1,
                    MINT_COEFFICIENTS.map((e, i) => e * BASIS_POINTS / 100 < PERCENTAGE_THRESHOLD ? i : '').filter(String),
                );
            });
            it('should allow to add addresses with suitable balance', async function () {
                const { contracts: { whitelistRegistry }, accounts } = await loadFixture(setupRegistry);
                const newResolverPercentageThreshold = PERCENTAGE_THRESHOLD / 2;
                await whitelistRegistry.setResolverPercentageThreshold(newResolverPercentageThreshold);
                const resolversToRegister = MINT_COEFFICIENTS.map(
                    (e, i) => (e * BASIS_POINTS / 100 >= newResolverPercentageThreshold) && (e * BASIS_POINTS / 100 < PERCENTAGE_THRESHOLD) ? i : '',
                ).filter(String);
                for (const resolver of resolversToRegister) {
                    await whitelistRegistry.connect(accounts[resolver]).register();
                }
                await expectAddrsInWhitelist(
                    whitelistRegistry,
                    0,
                    MINT_COEFFICIENTS.length - 1,
                    MINT_COEFFICIENTS.map((e, i) => e * BASIS_POINTS / 100 < newResolverPercentageThreshold ? i : '').filter(String),
                );
            });
        });
    });
});
