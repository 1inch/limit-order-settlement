const { expect, time, ether, constants } = require('@1inch/solidity-utils');
const { ethers } = require('hardhat');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { expBase } = require('./helpers/utils');

describe('PowerPod', function () {
    async function initContracts() {
        const commonLockDuration = time.duration.days('40');
        const MAX_WHITELISTED = 3;
        const BALANCE_THRESHOLD = 1000; // 10%

        const stakeAndRegisterInDelegation = async (st1inch, delegation, user, amount, userIndex) => {
            await st1inch.connect(user).deposit(0, commonLockDuration);
            await st1inch.depositFor(user.address, amount);
            await st1inch.connect(user).addPod(delegation.address);
            await delegation
                .connect(user)
                .functions['register(string,string)'](
                    `${userIndex}DelegatingToken`,
                    `A${userIndex}DT`,
                );
            await delegation.connect(user).delegate(user.address);
        };

        const accounts = await ethers.getSigners();
        const [owner, alice] = accounts;

        const TokenPermitMock = await ethers.getContractFactory('ERC20PermitMock');
        const oneInch = await TokenPermitMock.deploy('1inch', '1inch', owner.address, ether('200'));
        await oneInch.deployed();
        await oneInch.transfer(alice.address, ether('100'));

        const St1inch = await ethers.getContractFactory('St1inch');
        const st1inch = await St1inch.deploy(oneInch.address, expBase, owner.address);
        await st1inch.deployed();
        await oneInch.approve(st1inch.address, ether('100'));
        await oneInch.connect(alice).approve(st1inch.address, ether('100'));

        const PowerPod = await ethers.getContractFactory('PowerPod');
        const delegation = await PowerPod.deploy('PowerPod', 'PP', st1inch.address);
        await delegation.deployed();

        const WhitelistRegistry = await ethers.getContractFactory('WhitelistRegistry');
        const whitelistRegistry = await WhitelistRegistry.deploy(delegation.address, BALANCE_THRESHOLD);
        await whitelistRegistry.deployed();
        // fill all whitelist into WhitelistRegistry
        for (let i = 0; i < MAX_WHITELISTED; ++i) {
            const userIndex = i + 2;
            const user = accounts[userIndex];
            await stakeAndRegisterInDelegation(st1inch, delegation, user, ether('2') * BigInt(i + 1), userIndex);
            await whitelistRegistry.connect(user).register();
        }
        await stakeAndRegisterInDelegation(st1inch, delegation, owner, ether('1'), 0);

        const depositAndDelegateTo = async (st1inch, delegation, from, to, amount, duration = commonLockDuration) => {
            await st1inch.connect(from).deposit(amount, duration);
            await st1inch.connect(from).addPod(delegation.address);
            await delegation.connect(from).delegate(to);
        };

        return {
            contracts: { st1inch, delegation, whitelistRegistry },
            accounts: { owner, alice, accounts },
            functions: { depositAndDelegateTo },
            other: { commonLockDuration },
        };
    }

    describe('Should calculate voting power', function () {
        it('for account with 0 balance', async function () {
            const { contracts: { delegation }, accounts: { accounts } } = await loadFixture(initContracts);
            expect(await delegation.votingPowerOf(accounts[9].address)).to.equal(0);
        });

        it('for account with st1inch balance', async function () {
            const { contracts: { st1inch, delegation }, accounts: { alice } } = await loadFixture(initContracts);
            expect(await delegation.votingPowerOf(alice.address)).to.equal(await st1inch.votingPowerOf(alice.address));
        });
    });

    describe('For add to whitelist', function () {
        it('should add account, when sum stacked st1inch and deposit st1inch is sufficient', async function () {
            const {
                contracts: { st1inch, delegation, whitelistRegistry },
                accounts: { owner, alice },
                functions: { depositAndDelegateTo },
            } = await loadFixture(initContracts);
            // owner shouldn't register becouse his st1inch balance less that all of the whitelisted accounts
            await expect(whitelistRegistry.register()).to.be.revertedWithCustomError(
                whitelistRegistry,
                'BalanceLessThanThreshold',
            );
            // create other stake and delegate to owner
            await depositAndDelegateTo(st1inch, delegation, alice, owner.address, ether('2'));
            // register owner into whitelistRegistry and chack that
            await whitelistRegistry.register();
            expect(await whitelistRegistry.getWhitelist()).to.contain(owner.address);
        });

        it('should add account, when sum stacked st1inch and deposit st1inch is sufficient (delegate before deposit)', async function () {
            const {
                contracts: { st1inch, delegation, whitelistRegistry },
                accounts: { owner, alice },
                other: { commonLockDuration },
            } = await loadFixture(initContracts);
            // delegate to owner and deposit 1inch
            await st1inch.connect(alice).addPod(delegation.address);
            await delegation.connect(alice).delegate(owner.address);
            await st1inch.connect(alice).deposit(ether('2'), commonLockDuration);

            await whitelistRegistry.register();
        });

        it('should accrue DelegatedShare token after delegate', async function () {
            const {
                contracts: { st1inch, delegation },
                accounts: { owner, alice },
                functions: { depositAndDelegateTo },
            } = await loadFixture(initContracts);
            const DelegatedShare = await ethers.getContractFactory('DelegatedShare');
            const delegatedShare = DelegatedShare.attach(await delegation.registration(owner.address));
            const balanceDelegated = await delegatedShare.balanceOf(owner.address);
            expect(await delegatedShare.totalSupply()).to.equal(balanceDelegated);
            expect(await st1inch.balanceOf(owner.address)).to.equal(balanceDelegated);

            await depositAndDelegateTo(st1inch, delegation, alice, owner.address, ether('2'));

            const balanceDelegator = await delegatedShare.balanceOf(alice.address);
            expect(balanceDelegated.mul(await st1inch.balanceOf(alice.address))).to.equal(
                balanceDelegator.mul(await st1inch.balanceOf(owner.address)),
            );
        });

        it('should decrease delegatee balance, if delegator undelegate stake', async function () {
            const {
                contracts: { st1inch, delegation, whitelistRegistry },
                accounts: { owner, alice, accounts },
                functions: { depositAndDelegateTo },
            } = await loadFixture(initContracts);
            await depositAndDelegateTo(st1inch, delegation, alice, owner.address, ether('8'));
            await whitelistRegistry.register();

            await delegation.connect(alice).delegate(constants.ZERO_ADDRESS);
            await whitelistRegistry.connect(accounts[2]).register();
            expect(await whitelistRegistry.getWhitelist()).to.not.contain(owner.address);
        });

        it('should decrease delegatee balance, if delegator delegate to other account', async function () {
            const {
                contracts: { st1inch, delegation, whitelistRegistry },
                accounts: { owner, alice, accounts },
                functions: { depositAndDelegateTo },
            } = await loadFixture(initContracts);
            await depositAndDelegateTo(st1inch, delegation, alice, owner.address, ether('8'));
            await whitelistRegistry.register();

            await delegation.connect(alice).delegate(accounts[2].address);
            await whitelistRegistry.connect(accounts[2]).register();
            expect(await whitelistRegistry.getWhitelist()).to.not.contain(owner.address);
        });
    });
});
