const { expect, constants, ether, trackReceivedTokenAndTx } = require('@1inch/solidity-utils');
const { ethers } = require('hardhat');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { expBase } = require('./helpers/utils');

const BASIS_POINTS = 10000; // 100%
const PERCENTAGE_THRESHOLD = 1000; // 10%
const RESOLVER_BALANCE = ether('0.1');
const WHITELIST_LIMIT = Math.floor(BASIS_POINTS / PERCENTAGE_THRESHOLD);
const MINT_COEFFICIENTS = [20, 26, 1, 5, 15, 1, 10, 1, 20, 1];

describe('WhitelistRegistry', function () {
    let addrs;
    let st1inch;

    async function expectAddrsInWhitelist(whitelistRegistry, indexFrom, indexTo, except = []) {
        const whitelist = await whitelistRegistry.getWhitelist();
        for (let i = indexFrom; i <= indexTo; i++) {
            if (except.indexOf(i) !== -1) {
                expect(whitelist).to.not.contain(addrs[i].address);
            } else {
                expect(whitelist).to.contain(addrs[i].address);
            }
        }
    };

    before(async function () {
        addrs = await ethers.getSigners();
        const St1inch = await ethers.getContractFactory('St1inch');
        st1inch = await St1inch.deploy(constants.ZERO_ADDRESS, expBase, addrs[0].address);
        await st1inch.deployed();
    });

    async function initContracts() {
        const PowerPodMock = await ethers.getContractFactory('PowerPodMock');
        const rewardableDelegationPod = await PowerPodMock.deploy('reward1INCH', 'reward1INCH', st1inch.address);
        await rewardableDelegationPod.deployed();
        const WhitelistRegistry = await ethers.getContractFactory('WhitelistRegistry');
        const whitelistRegistry = await WhitelistRegistry.deploy(
            rewardableDelegationPod.address,
            PERCENTAGE_THRESHOLD,
        );
        await whitelistRegistry.deployed();
        return { rewardableDelegationPod, whitelistRegistry };
    }

    describe('storage vars', function () {
        it('check storage vars', async function () {
            const { rewardableDelegationPod, whitelistRegistry } = await loadFixture(initContracts);
            expect(await whitelistRegistry.resolverPercentageThreshold()).to.equal(PERCENTAGE_THRESHOLD);
            expect(await whitelistRegistry.token()).to.equal(rewardableDelegationPod.address);
        });
    });

    describe('setters', function () {
        it('percentage threshold setter', async function () {
            const { whitelistRegistry } = await loadFixture(initContracts);
            const newThreshold = 100; // 1%
            await whitelistRegistry.setResolverPercentageThreshold(newThreshold);
            expect(await whitelistRegistry.resolverPercentageThreshold()).to.equal(newThreshold);
        });

        it('percentage threshold setter works only for the owner', async function () {
            const { whitelistRegistry } = await loadFixture(initContracts);
            const newThreshold = 100; // 1%
            await expect(
                whitelistRegistry.connect(addrs[1]).setResolverPercentageThreshold(newThreshold),
            ).to.be.revertedWith('Ownable: caller is not the owner');
            expect(await whitelistRegistry.resolverPercentageThreshold()).to.equal(PERCENTAGE_THRESHOLD);
        });
    });

    describe('rescueFunds', function () {
        it('should rescue funds', async function () {
            const { whitelistRegistry } = await loadFixture(initContracts);
            const amount = '0x100';
            await ethers.provider.send('hardhat_setBalance', [
                whitelistRegistry.address,
                amount,
            ]);
            expect(await ethers.provider.getBalance(whitelistRegistry.address)).to.be.equal(amount);
            const rescueFunds = () => whitelistRegistry.rescueFunds(constants.ZERO_ADDRESS, amount / 2);
            const [diff] = await trackReceivedTokenAndTx(ethers.provider, { address: constants.ZERO_ADDRESS }, addrs[0].address, rescueFunds);
            expect(diff).to.be.equal(amount / 2);
            expect(await ethers.provider.getBalance(whitelistRegistry.address)).to.be.equal(amount / 2);
        });

        it('should not rescue funds by non-owner', async function () {
            const { whitelistRegistry } = await loadFixture(initContracts);
            const amount = '0x100';
            await ethers.provider.send('hardhat_setBalance', [
                whitelistRegistry.address,
                amount,
            ]);
            expect(await ethers.provider.getBalance(whitelistRegistry.address)).to.be.equal(amount);
            await expect(
                whitelistRegistry.connect(addrs[1]).rescueFunds(constants.ZERO_ADDRESS, amount / 2)
            ).to.be.revertedWith('Ownable: caller is not the owner');
            expect(await ethers.provider.getBalance(whitelistRegistry.address)).to.be.equal(amount);
        });
    });

    describe('register', function () {
        describe('should whitelist', function () {
            it('10 addresses', async function () {
                const { rewardableDelegationPod, whitelistRegistry } = await loadFixture(initContracts);
                expect(await rewardableDelegationPod.totalSupply()).to.equal(0);
                for (let i = 1; i <= WHITELIST_LIMIT; ++i) {
                    await rewardableDelegationPod.mint(addrs[i].address, RESOLVER_BALANCE);
                }
                for (let i = 1; i <= WHITELIST_LIMIT; ++i) {
                    await whitelistRegistry.connect(addrs[i]).register();
                    expect(await whitelistRegistry.getWhitelist()).to.contain(addrs[i].address);
                }
            });

            it('10/10 addresses, then fail to whitelist due to not enough balance, then move power and whitelist successfully', async function () {
                const { rewardableDelegationPod, whitelistRegistry } = await loadFixture(initContracts);
                for (let i = 1; i <= WHITELIST_LIMIT; ++i) {
                    await rewardableDelegationPod.mint(addrs[i].address, RESOLVER_BALANCE);
                }
                for (let i = 1; i <= WHITELIST_LIMIT; ++i) {
                    await whitelistRegistry.connect(addrs[i]).register();
                    expect(await whitelistRegistry.getWhitelist()).to.contain(addrs[i].address);
                }
                await expect(
                    whitelistRegistry.connect(addrs[WHITELIST_LIMIT + 1]).register(),
                ).to.be.revertedWithCustomError(whitelistRegistry, 'BalanceLessThanThreshold');
                expect(await whitelistRegistry.getWhitelist()).to.not.contain(addrs[WHITELIST_LIMIT + 1].address);
    
                await rewardableDelegationPod.burn(addrs[1].address, RESOLVER_BALANCE);
                await rewardableDelegationPod.mint(addrs[WHITELIST_LIMIT + 1].address, RESOLVER_BALANCE);
    
                await whitelistRegistry.connect(addrs[WHITELIST_LIMIT + 1]).register();
                const whitelist = await whitelistRegistry.getWhitelist();
                expect(whitelist).to.contain(addrs[WHITELIST_LIMIT + 1].address);
                await expectAddrsInWhitelist(whitelistRegistry, 1, WHITELIST_LIMIT + 1, [1]);
            });
    
            it('5/10 addresses, then lower balance, then whitelist +1 successfully', async function () {
                const { rewardableDelegationPod, whitelistRegistry } = await loadFixture(initContracts);
                const resolversNumber = WHITELIST_LIMIT / 2;
                for (let i = 1; i <= resolversNumber; ++i) {
                    await rewardableDelegationPod.mint(addrs[i].address, RESOLVER_BALANCE);
                }
                for (let i = 1; i <= resolversNumber; ++i) {
                    await whitelistRegistry.connect(addrs[i]).register();
                    expect(await whitelistRegistry.getWhitelist()).to.contain(addrs[i].address);
                }
                await rewardableDelegationPod.burn(addrs[3].address, RESOLVER_BALANCE / 2n);
                expect(await whitelistRegistry.getWhitelist()).to.contain(addrs[3].address);
                await whitelistRegistry.clean();
                expect(await whitelistRegistry.getWhitelist()).to.contain(addrs[3].address);
                await rewardableDelegationPod.mint(addrs[resolversNumber + 1].address, RESOLVER_BALANCE / 2n);
                await whitelistRegistry.connect(addrs[resolversNumber + 1]).register();
                const whitelist = await whitelistRegistry.getWhitelist();
                expect(whitelist).to.contain(addrs[3].address);
                expect(whitelist).to.contain(addrs[resolversNumber + 1].address);
            });
    
            it('5/10 addresses, then lower balance, then whitelist instead successfully', async function () {
                const { rewardableDelegationPod, whitelistRegistry } = await loadFixture(initContracts);
                const resolversNumber = WHITELIST_LIMIT / 2;
                for (let i = 1; i <= resolversNumber; ++i) {
                    await rewardableDelegationPod.mint(addrs[i].address, RESOLVER_BALANCE);
                }
                for (let i = 1; i <= resolversNumber; ++i) {
                    await whitelistRegistry.connect(addrs[i]).register();
                    expect(await whitelistRegistry.getWhitelist()).to.contain(addrs[i].address);
                }
                await rewardableDelegationPod.burn(addrs[3].address, RESOLVER_BALANCE / 4n * 3n);
                expect(await whitelistRegistry.getWhitelist()).to.contain(addrs[3].address);
                await whitelistRegistry.clean();
                expect(await whitelistRegistry.getWhitelist()).to.not.contain(addrs[3].address);
                await rewardableDelegationPod.mint(addrs[resolversNumber + 1].address, RESOLVER_BALANCE / 2n);
                await whitelistRegistry.connect(addrs[resolversNumber + 1]).register();
                await expect(
                    whitelistRegistry.connect(addrs[3]).register(),
                ).to.be.revertedWithCustomError(whitelistRegistry, 'BalanceLessThanThreshold');
                const whitelist = await whitelistRegistry.getWhitelist();
                expect(whitelist).to.contain(addrs[resolversNumber + 1].address);
                expect(whitelist).to.not.contain(addrs[3].address);
            });
        });

        describe('should fail to whitelist', function () {
            it('due to zero total supply', async function () {
                const { rewardableDelegationPod, whitelistRegistry } = await loadFixture(initContracts);
                expect(await rewardableDelegationPod.totalSupply()).to.be.equal(0n);
                await expect(whitelistRegistry.connect(addrs[1]).register()).to.be.revertedWithCustomError(
                    whitelistRegistry,
                    'ZeroTotalSupply',
                );
            });

            it('due to percentage lower than threshold', async function () {
                const { rewardableDelegationPod, whitelistRegistry } = await loadFixture(initContracts);
                // increasing total supply to avoid division by zero
                await rewardableDelegationPod.mint(addrs[0].address, RESOLVER_BALANCE);
                await expect(whitelistRegistry.connect(addrs[1]).register()).to.be.revertedWithCustomError(
                    whitelistRegistry,
                    'BalanceLessThanThreshold',
                );
            });
    
            it('the same address twice', async function () {
                const { rewardableDelegationPod, whitelistRegistry } = await loadFixture(initContracts);
                await rewardableDelegationPod.mint(addrs[1].address, RESOLVER_BALANCE);
                await whitelistRegistry.connect(addrs[1]).register();
                await expect(whitelistRegistry.connect(addrs[1]).register()).to.be.revertedWithCustomError(
                    whitelistRegistry,
                    'AlreadyRegistered',
                );
            });
        });
    });

    describe('promote', function () {
        it('should register and promote provided address', async function () {
            const { rewardableDelegationPod, whitelistRegistry } = await loadFixture(initContracts);
            await rewardableDelegationPod.mint(addrs[0].address, RESOLVER_BALANCE);
            await whitelistRegistry.register();
            await whitelistRegistry.promote(1, addrs[1].address);
            const promotees = await whitelistRegistry.getPromotees(1);
            expect(promotees).to.not.contain(addrs[0].address);
            expect(promotees).to.contain(addrs[1].address);
        });

        it('should change promotee', async function () {
            const { rewardableDelegationPod, whitelistRegistry } = await loadFixture(initContracts);
            await rewardableDelegationPod.mint(addrs[0].address, RESOLVER_BALANCE);
            await whitelistRegistry.register();
            expect(await whitelistRegistry.getWhitelist()).to.contain(addrs[0].address);
            await expect(
                whitelistRegistry.promote(1, addrs[1].address),
            ).to.emit(whitelistRegistry, 'Promotion').withArgs(addrs[0].address, 1, addrs[1].address);
            let promotees = await whitelistRegistry.getPromotees(1);
            expect(promotees).to.not.contain(addrs[0].address);
            expect(promotees).to.contain(addrs[1].address);
            await expect(
                whitelistRegistry.promote(1, addrs[2].address),
            ).to.emit(whitelistRegistry, 'Promotion').withArgs(addrs[0].address, 1, addrs[2].address);
            promotees = await whitelistRegistry.getPromotees(1);
            expect(promotees).to.not.contain(addrs[1].address);
            expect(promotees).to.contain(addrs[2].address);
        });

        it('should delete promotee on removal', async function () {
            const { rewardableDelegationPod, whitelistRegistry } = await loadFixture(initContracts);
            await rewardableDelegationPod.mint(addrs[0].address, RESOLVER_BALANCE);
            await whitelistRegistry.register();
            await whitelistRegistry.promote(1, addrs[1].address);
            await rewardableDelegationPod.mint(addrs[2].address, RESOLVER_BALANCE * BigInt(WHITELIST_LIMIT));
            await whitelistRegistry.clean();
            const promotees = await whitelistRegistry.getPromotees(1);
            expect(promotees).to.not.contain(addrs[0].address);
            expect(promotees).to.not.contain(addrs[1].address);
        });

        it('should not register the same promote twice', async function () {
            const { rewardableDelegationPod, whitelistRegistry } = await loadFixture(initContracts);
            await rewardableDelegationPod.mint(addrs[0].address, RESOLVER_BALANCE);
            await whitelistRegistry.register();
            await whitelistRegistry.promote(1, addrs[1].address);
            const promotees = await whitelistRegistry.getPromotees(1);
            expect(promotees).to.not.contain(addrs[0].address);
            expect(promotees).to.contain(addrs[1].address);

            await expect(
                whitelistRegistry.promote(1, addrs[1].address),
            ).to.be.revertedWithCustomError(whitelistRegistry, 'SamePromotee');
        });
    });

    describe('clean', function () {
        it('should remove from whitelist addresses which have not enough staked balance', async function () {
            const { rewardableDelegationPod, whitelistRegistry } = await loadFixture(initContracts);
            for (let i = 0; i < WHITELIST_LIMIT; ++i) {
                await rewardableDelegationPod.mint(addrs[i].address, RESOLVER_BALANCE);
                await whitelistRegistry.connect(addrs[i]).register();
                expect(await whitelistRegistry.getWhitelist()).to.contain(addrs[i].address);
                if (i % 2 === 1) {
                    await rewardableDelegationPod.burn(addrs[i].address, RESOLVER_BALANCE);
                    await rewardableDelegationPod.mint(addrs[i - 1].address, RESOLVER_BALANCE);
                }
            }
            await whitelistRegistry.clean();
            const whitelist = await whitelistRegistry.getWhitelist();
            for (let i = 0; i < WHITELIST_LIMIT; ++i) {
                if (i % 2 === 1) {
                    expect(whitelist).to.not.contain(addrs[i].address);
                } else {
                    expect(whitelist).to.contain(addrs[i].address);
                }
            }
        });

        it('should not remove from whitelist addresses which have enough staked balance', async function () {
            const { rewardableDelegationPod, whitelistRegistry } = await loadFixture(initContracts);
            for (let i = 0; i < WHITELIST_LIMIT; ++i) {
                await rewardableDelegationPod.mint(addrs[i].address, RESOLVER_BALANCE);
                await whitelistRegistry.connect(addrs[i]).register();
                expect(await whitelistRegistry.getWhitelist()).to.contain(addrs[i].address);
            }
            await whitelistRegistry.clean();
            await expectAddrsInWhitelist(whitelistRegistry, 0, WHITELIST_LIMIT - 1);
        });

        it('should fail due to zero total supply', async function () {
            const { rewardableDelegationPod, whitelistRegistry } = await loadFixture(initContracts);
            expect(await rewardableDelegationPod.totalSupply()).to.be.equal(0n);
            await expect(
                whitelistRegistry.clean()
            ).to.be.revertedWithCustomError(whitelistRegistry, 'ZeroTotalSupply');
            expect(await whitelistRegistry.getWhitelist()).to.be.empty;
        });
    });

    async function setupRegistry() {
        const { rewardableDelegationPod, whitelistRegistry } = await initContracts();
        for (let i = 0; i < MINT_COEFFICIENTS.length; ++i) {
            await rewardableDelegationPod.mint(addrs[i].address, RESOLVER_BALANCE * BigInt(MINT_COEFFICIENTS[i]) / 100n);
            if (MINT_COEFFICIENTS[i] * BASIS_POINTS / 100 >= PERCENTAGE_THRESHOLD) {
                await whitelistRegistry.connect(addrs[i]).register();
            }
        }
        return { rewardableDelegationPod, whitelistRegistry };
    }

    describe('setResolverPercentageThreshold', function () {
        describe('increase more than current resolver percentage threshold', function () {
            it('should not change whitelist without clean', async function () {
                const { whitelistRegistry } = await loadFixture(setupRegistry);
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
                const { whitelistRegistry } = await loadFixture(setupRegistry);
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
                const { whitelistRegistry } = await loadFixture(setupRegistry);
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
                const { whitelistRegistry } = await loadFixture(setupRegistry);
                const newResolverPercentageThreshold = PERCENTAGE_THRESHOLD / 2;
                await whitelistRegistry.setResolverPercentageThreshold(newResolverPercentageThreshold);
                const resolversToRegister = MINT_COEFFICIENTS.map(
                    (e, i) => (e * BASIS_POINTS / 100 >= newResolverPercentageThreshold) && (e * BASIS_POINTS / 100 < PERCENTAGE_THRESHOLD) ? i : '',
                ).filter(String);
                for (const resolver of resolversToRegister) {
                    await whitelistRegistry.connect(addrs[resolver]).register();
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
