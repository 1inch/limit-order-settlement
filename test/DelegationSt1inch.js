const { expect, ether, toBN, time } = require('@1inch/solidity-utils');
const { addr0Wallet, addr1Wallet } = require('./helpers/utils');

const TokenPermitMock = artifacts.require('ERC20PermitMock');
const WhitelistRegistry = artifacts.require('WhitelistRegistry');
const RewardableDelegation = artifacts.require('RewardableDelegation');
const St1inch = artifacts.require('St1inch');

describe('Delegation st1inch', async () => {
    const [addr0, addr1] = [addr0Wallet.getAddressString(), addr1Wallet.getAddressString()];
    const baseExp = toBN('999999981746377019');
    const threshold = ether('1');
    const MAX_WHITELISTED = 3;
    const maxSt1inchFarms = 5;
    const maxDelegatorsFarms = 5;
    const maxUserDelegations = 5;
    const commonLockDuration = time.duration.days('10');

    const stakeAndRegisterInDelegation = async (user, amount, userIndex) => {
        await this.st1inch.depositFor(user, amount, commonLockDuration);
        await this.delegation.contract.methods
            .register(`${userIndex}DelegatingToken`, `A${userIndex}DT`, maxDelegatorsFarms)
            .send({ from: user });
        await this.st1inch.delegate(this.delegation.address, user, { from: user });
    };

    before(async () => {
        this.chainId = await web3.eth.getChainId();
        this.accounts = await web3.eth.getAccounts();
    });

    beforeEach(async () => {
        this.oneInch = await TokenPermitMock.new('1inch', '1inch', addr0, ether('200'));
        await this.oneInch.transfer(addr1, ether('100'));

        this.st1inch = await St1inch.new(this.oneInch.address, baseExp, maxSt1inchFarms, maxUserDelegations);
        await this.oneInch.approve(this.st1inch.address, ether('100'));
        await this.oneInch.approve(this.st1inch.address, ether('100'), {
            from: addr1,
        });
        this.delegation = await RewardableDelegation.new('Rewardable', 'RWD');
        this.whitelistRegistry = await WhitelistRegistry.new(this.delegation.address, threshold, MAX_WHITELISTED);
        await this.delegation.transferOwnership(this.st1inch.address);
    });

    describe('For add to whitelist', async () => {
        const depositAndDelegateTo = async (from, to, amount, duration = commonLockDuration) => {
            await this.st1inch.deposit(amount, duration, { from });
            await this.st1inch.delegate(this.delegation.address, to, { from });
        };

        beforeEach(async () => {
            // fill all whitelist into WhitelistRegistry
            for (let i = 0; i < MAX_WHITELISTED; ++i) {
                const userIndex = i + 2;
                const user = this.accounts[userIndex];
                await stakeAndRegisterInDelegation(user, ether('2').muln(i + 1), userIndex);
                await this.whitelistRegistry.register({ from: user });
            }
            await stakeAndRegisterInDelegation(addr0, ether('1'), 0);
        });

        it('should add account, when sum stacked st1inch and deposit st1inch is sufficient', async () => {
            // addr0 shouldn't register becouse his st1inch balance less that all of the whitelisted accounts
            await expect(this.whitelistRegistry.register()).to.be.rejectedWith('NotEnoughBalance()');
            // create other stake and delegate to addr0
            await depositAndDelegateTo(addr1, addr0, ether('2'));
            // register addr0 into whitelistRegistry and chack that
            await this.whitelistRegistry.register();
            expect(await this.whitelistRegistry.isWhitelisted(addr0)).to.be.equal(true);
        });

        it('should add account, when sum stacked st1inch and deposit st1inch is sufficient (delegate before deposit)', async () => {
            // delegate to addr0 and deposit 1inch
            await this.st1inch.delegate(this.delegation.address, addr0, { from: addr1 });
            await this.st1inch.deposit(ether('2'), commonLockDuration, { from: addr1 });

            await this.whitelistRegistry.register();
        });

        it('should decrease delegatee balance, if delegator undelegate stake', async () => {
            await depositAndDelegateTo(addr1, addr0, ether('2'));
            await this.whitelistRegistry.register();

            await this.st1inch.undelegate(this.delegation.address, { from: addr1 });
            await this.whitelistRegistry.register({ from: this.accounts[2] });
            expect(await this.whitelistRegistry.isWhitelisted(addr0)).to.be.equal(false);
        });

        it('should decrease delegatee balance, if delegator delegate to other account', async () => {
            await depositAndDelegateTo(addr1, addr0, ether('2'));
            await this.whitelistRegistry.register();

            await this.st1inch.delegate(this.delegation.address, this.accounts[2], { from: addr1 });
            await this.whitelistRegistry.register({ from: this.accounts[2] });
            expect(await this.whitelistRegistry.isWhitelisted(addr0)).to.be.equal(false);
        });
    });
});
