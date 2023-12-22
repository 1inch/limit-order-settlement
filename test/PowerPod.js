const { expect, time, ether, deployContract, constants } = require('@1inch/solidity-utils');
const { ethers } = require('hardhat');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { expBase } = require('./helpers/fusionUtils');

const COMMON_LOCK_DURATION = time.duration.days('40');
const MAX_WHITELISTED = 3;
const BALANCE_THRESHOLD = 1000; // 10%

describe('PowerPod', function () {
    const stakeAndRegisterInDelegation = async (st1inch, delegation, user, amount, userIndex) => {
        await st1inch.connect(user).deposit(0, COMMON_LOCK_DURATION);
        await st1inch.depositFor(user, amount);
        await st1inch.connect(user).addPlugin(delegation);
        await delegation.connect(user).register(`${userIndex}DelegatingToken`, `A${userIndex}DT`);
        await delegation.connect(user).delegate(user);
    };

    const depositAndDelegateTo = async (st1inch, delegation, from, to, amount, duration = COMMON_LOCK_DURATION) => {
        await st1inch.connect(from).deposit(amount, duration);
        await st1inch.connect(from).addPlugin(delegation);
        await delegation.connect(from).delegate(to);
    };

    async function initContracts() {
        const accounts = await ethers.getSigners();
        const [owner, alice, whitelistedUser1, /* whitelistedUser2 */, /* whitelistedUser3 */, clearAddress] = accounts;

        const oneInch = await deployContract('ERC20PermitMock', ['1inch', '1inch', owner, ether('200')]);
        await oneInch.transfer(alice, ether('100'));

        const st1inch = await deployContract('St1inch', [oneInch, expBase, owner]);
        await oneInch.approve(st1inch, ether('100'));
        await oneInch.connect(alice).approve(st1inch, ether('100'));

        const delegation = await deployContract('PowerPod', ['PowerPod', 'PP', st1inch]);

        const whitelistRegistry = await deployContract('WhitelistRegistry', [delegation, BALANCE_THRESHOLD]);
        // fill all whitelist into WhitelistRegistry
        for (let i = 0; i < MAX_WHITELISTED; ++i) {
            const userIndex = i + 2;
            const user = accounts[userIndex];
            await stakeAndRegisterInDelegation(st1inch, delegation, user, ether('2') * BigInt(i + 1), userIndex);
            await whitelistRegistry.connect(user).register();
        }
        await stakeAndRegisterInDelegation(st1inch, delegation, owner, ether('1'), 0);

        return {
            contracts: { st1inch, delegation, whitelistRegistry },
            accounts: { owner, alice, whitelistedUser1, clearAddress },
        };
    }

    describe('Should calculate voting power', function () {
        it('for account with 0 balance', async function () {
            const { contracts: { delegation }, accounts: { clearAddress } } = await loadFixture(initContracts);
            expect(await delegation.votingPowerOf(clearAddress)).to.equal(0);
        });

        it('for account with st1inch balance', async function () {
            const { contracts: { st1inch, delegation }, accounts: { alice } } = await loadFixture(initContracts);
            expect(await delegation.votingPowerOf(alice)).to.equal(await st1inch.votingPowerOf(alice));
        });
    });

    describe('For add to whitelist', function () {
        it('should add account, when sum stacked st1inch and deposit st1inch is sufficient', async function () {
            const {
                contracts: { st1inch, delegation, whitelistRegistry },
                accounts: { owner, alice },
            } = await loadFixture(initContracts);
            // owner shouldn't register becouse his st1inch balance less that all of the whitelisted accounts
            await expect(whitelistRegistry.register()).to.be.revertedWithCustomError(
                whitelistRegistry,
                'BalanceLessThanThreshold',
            );
            // create another stake and delegate to owner
            await depositAndDelegateTo(st1inch, delegation, alice, owner, ether('2'));
            // register owner into whitelistRegistry and chack that
            await whitelistRegistry.register();
            expect(await whitelistRegistry.getWhitelist()).to.contain(owner.address);
        });

        it('should add account, when sum stacked st1inch and deposit st1inch is sufficient (delegate before deposit)', async function () {
            const {
                contracts: { st1inch, delegation, whitelistRegistry },
                accounts: { owner, alice },
            } = await loadFixture(initContracts);
            // delegate to owner and deposit 1inch
            await st1inch.connect(alice).addPlugin(delegation);
            await delegation.connect(alice).delegate(owner);
            await st1inch.connect(alice).deposit(ether('2'), COMMON_LOCK_DURATION);

            await whitelistRegistry.register();
        });

        it('should accrue DelegatedShare token after delegate', async function () {
            const {
                contracts: { st1inch, delegation },
                accounts: { owner, alice },
            } = await loadFixture(initContracts);
            const DelegatedShare = await ethers.getContractFactory('DelegatedShare');
            const delegatedShare = DelegatedShare.attach(await delegation.registration(owner));
            const balanceDelegated = await delegatedShare.balanceOf(owner);
            expect(await delegatedShare.totalSupply()).to.equal(balanceDelegated);
            expect(await st1inch.balanceOf(owner)).to.equal(balanceDelegated);

            await depositAndDelegateTo(st1inch, delegation, alice, owner, ether('2'));

            const balanceDelegator = await delegatedShare.balanceOf(alice);
            expect(balanceDelegated * (await st1inch.balanceOf(alice))).to.equal(
                balanceDelegator * (await st1inch.balanceOf(owner)),
            );
        });

        it('should decrease delegatee balance, if delegator undelegate stake', async function () {
            const {
                contracts: { st1inch, delegation, whitelistRegistry },
                accounts: { owner, alice, whitelistedUser1 },
            } = await loadFixture(initContracts);
            await depositAndDelegateTo(st1inch, delegation, alice, owner, ether('8'));
            await whitelistRegistry.register();

            await delegation.connect(alice).delegate(constants.ZERO_ADDRESS);
            await whitelistRegistry.connect(whitelistedUser1).register();
            expect(await whitelistRegistry.getWhitelist()).to.not.contain(owner.address);
        });

        it('should decrease delegatee balance, if delegator delegate to another account', async function () {
            const {
                contracts: { st1inch, delegation, whitelistRegistry },
                accounts: { owner, alice, whitelistedUser1 },
            } = await loadFixture(initContracts);
            await depositAndDelegateTo(st1inch, delegation, alice, owner, ether('8'));
            await whitelistRegistry.register();

            await delegation.connect(alice).delegate(whitelistedUser1);
            await whitelistRegistry.connect(whitelistedUser1).register();
            expect(await whitelistRegistry.getWhitelist()).to.not.contain(owner.address);
        });
    });
});
