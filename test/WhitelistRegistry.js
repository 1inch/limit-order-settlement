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
});
