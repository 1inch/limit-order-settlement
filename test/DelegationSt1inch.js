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
    const maxUserFarms = 5;
    const maxUserDelegations = 5;
    const commonLockDuration = time.duration.days('10');

    const stakeAndRegisterIntoDelegation = async (user, amount, userIndex) => {
        await this.st1inch.depositFor(user, amount, commonLockDuration);
        await this.delegation.contract.methods
            .register(`${userIndex}DelegatingToken`, `A${userIndex}DT`, '5')
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

        this.st1inch = await St1inch.new(this.oneInch.address, baseExp, maxUserFarms, maxUserDelegations);
        await this.oneInch.approve(this.st1inch.address, ether('100'));
        await this.oneInch.approve(this.st1inch.address, ether('100'), {
            from: addr1,
        });
        this.delegation = await RewardableDelegation.new('Rewardable', 'RWD');
        this.whitelistRegistry = await WhitelistRegistry.new(this.delegation.address, threshold, MAX_WHITELISTED);
        await this.delegation.transferOwnership(this.st1inch.address);
    });

    it('should add account into whitelist, when sum stacked st1inch and deposit st1inch is sufficient', async () => {
        // fill all whitelist into WhitelistRegistry
        for (let i = 0; i < MAX_WHITELISTED; ++i) {
            const userIndex = i + 2;
            const user = this.accounts[userIndex];
            await stakeAndRegisterIntoDelegation(user, ether('2').muln(i + 1), userIndex);
            await this.whitelistRegistry.register({ from: user });
        }
        await stakeAndRegisterIntoDelegation(addr0, ether('1'), 0);
        // addr0 shouldn't register becouse his st1inch balance less that all of the whitelisted accounts
        await expect(this.whitelistRegistry.register()).to.be.rejectedWith('NotEnoughBalance()');
        // create other stake and delegate to addr0
        await this.st1inch.deposit(ether('2'), commonLockDuration, { from: addr1 });
        await this.st1inch.delegate(this.delegation.address, addr0, { from: addr1 });
        // register addr0 into whitelistRegistry and chack that
        await this.whitelistRegistry.register();
        expect(await this.whitelistRegistry.isWhitelisted(addr0)).to.be.equal(true);
    });
});
