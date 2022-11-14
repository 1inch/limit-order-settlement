const { expect, time, ether, constants } = require('@1inch/solidity-utils');
const { ethers } = require('hardhat');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

describe('Delegation st1inch', function () {
    let addr, addr1;
    let accounts;
    const baseExp = 999999981746377019n;
    const threshold = ether('0.1');
    const MAX_WHITELISTED = 3;
    const maxPods = 5;
    const commonLockDuration = time.duration.days('10');

    const stakeAndRegisterInDelegation = async (st1inch, delegation, user, amount, userIndex) => {
        await st1inch.connect(user).increaseLockDuration(commonLockDuration);
        await st1inch.depositFor(user.address, amount);
        await st1inch.connect(user).addPod(delegation.address);
        await delegation
            .connect(user)
            .functions['register(string,string,uint256,address)'](
                `${userIndex}DelegatingToken`,
                `A${userIndex}DT`,
                maxPods,
                constants.ZERO_ADDRESS,
            );
        await delegation.connect(user).delegate(user.address);
    };

    async function initContracts() {
        const TokenPermitMock = await ethers.getContractFactory('ERC20PermitMock');
        const oneInch = await TokenPermitMock.deploy('1inch', '1inch', addr.address, ether('200'));
        await oneInch.deployed();
        await oneInch.transfer(addr1.address, ether('100'));

        const St1inch = await ethers.getContractFactory('St1inch');
        const st1inch = await St1inch.deploy(oneInch.address, baseExp, maxPods);
        await st1inch.deployed();
        await oneInch.approve(st1inch.address, ether('100'));
        await oneInch.connect(addr1).approve(st1inch.address, ether('100'));

        const RewardableDelegation = await ethers.getContractFactory('RewardableDelegationPodWithVotingPower');
        const delegation = await RewardableDelegation.deploy('Rewardable', 'RWD', st1inch.address);
        await delegation.deployed();
        const WhitelistRegistry = await ethers.getContractFactory('WhitelistRegistry');
        const whitelistRegistry = await WhitelistRegistry.deploy(delegation.address, threshold, MAX_WHITELISTED);
        await whitelistRegistry.deployed();
        // fill all whitelist into WhitelistRegistry
        for (let i = 0; i < MAX_WHITELISTED; ++i) {
            const userIndex = i + 2;
            const user = accounts[userIndex];
            await stakeAndRegisterInDelegation(st1inch, delegation, user, ether('2') * BigInt(i + 1), userIndex);
            await whitelistRegistry.connect(user).register();
        }
        await stakeAndRegisterInDelegation(st1inch, delegation, addr, ether('1'), 0);

        return { st1inch, delegation, whitelistRegistry };
    }

    before(async function () {
        accounts = await ethers.getSigners();
        addr = accounts[0];
        addr1 = accounts[1];
    });

    describe('For add to whitelist', function () {
        const depositAndDelegateTo = async (st1inch, delegation, from, to, amount, duration = commonLockDuration) => {
            await st1inch.connect(from).deposit(amount, duration);
            await st1inch.connect(from).addPod(delegation.address);
            await delegation.connect(from).delegate(to);
        };

        it('should add account, when sum stacked st1inch and deposit st1inch is sufficient', async function () {
            const { st1inch, delegation, whitelistRegistry } = await loadFixture(initContracts);
            // addr shouldn't register becouse his st1inch balance less that all of the whitelisted accounts
            await expect(whitelistRegistry.register()).to.be.revertedWithCustomError(
                whitelistRegistry,
                'NotEnoughBalance',
            );
            // create other stake and delegate to addr
            await depositAndDelegateTo(st1inch, delegation, addr1, addr.address, ether('2'));
            // register addr into whitelistRegistry and chack that
            await whitelistRegistry.register();
            expect(await whitelistRegistry.isWhitelisted(addr.address)).to.equal(true);
        });

        it('should add account, when sum stacked st1inch and deposit st1inch is sufficient (delegate before deposit)', async function () {
            const { st1inch, delegation, whitelistRegistry } = await loadFixture(initContracts);
            // delegate to addr and deposit 1inch
            await st1inch.connect(addr1).addPod(delegation.address);
            await delegation.connect(addr1).delegate(addr.address);
            await st1inch.connect(addr1).deposit(ether('2'), commonLockDuration);

            await whitelistRegistry.register();
        });

        it('should accrue DelegatedShare token after delegate', async function () {
            const { st1inch, delegation } = await loadFixture(initContracts);
            const DelegatedShare = await ethers.getContractFactory('DelegatedShare');
            const delegatedShare = await DelegatedShare.attach(await delegation.registration(addr.address));
            const balanceDelegated = await delegatedShare.balanceOf(addr.address);
            expect(await delegatedShare.totalSupply()).to.equal(balanceDelegated);
            expect(await st1inch.balanceOf(addr.address)).to.equal(balanceDelegated);

            await depositAndDelegateTo(st1inch, delegation, addr1, addr.address, ether('2'));

            const balanceDelegator = await delegatedShare.balanceOf(addr1.address);
            expect(balanceDelegated.mul(await st1inch.balanceOf(addr1.address))).to.equal(
                balanceDelegator.mul(await st1inch.balanceOf(addr.address)),
            );
        });

        it('should decrease delegatee balance, if delegator undelegate stake', async function () {
            const { st1inch, delegation, whitelistRegistry } = await loadFixture(initContracts);
            await depositAndDelegateTo(st1inch, delegation, addr1, addr.address, ether('2'));
            await whitelistRegistry.register();

            await delegation.connect(addr1).delegate(constants.ZERO_ADDRESS);
            await whitelistRegistry.connect(accounts[2]).register();
            expect(await whitelistRegistry.isWhitelisted(addr.address)).to.equal(false);
        });

        it('should decrease delegatee balance, if delegator delegate to other account', async function () {
            const { st1inch, delegation, whitelistRegistry } = await loadFixture(initContracts);
            await depositAndDelegateTo(st1inch, delegation, addr1, addr.address, ether('2'));
            await whitelistRegistry.register();

            await delegation.connect(addr1).delegate(accounts[2].address);
            await whitelistRegistry.connect(accounts[2]).register();
            expect(await whitelistRegistry.isWhitelisted(addr.address)).to.equal(false);
        });
    });
});
