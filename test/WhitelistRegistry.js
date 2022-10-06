const { expect, ether, toBN } = require('@1inch/solidity-utils');
const { artifacts } = require('hardhat');

const WhitelistRegistry = artifacts.require('WhitelistRegistry');
const StakingTokenMock = artifacts.require('StakingTokenMock');
const THRESHOLD = ether('1');
const VOTING_POWER_THRESHOLD = THRESHOLD.muln(2);
const MAX_WHITELSITED = 10;
const DUMMY_ADDRESS = '0xdF20864533D39994a9FE499EeA663C8c7285fb57';

describe('WhitelistRegistry', async () => {
    let addrs;

    before(async () => {
        addrs = await web3.eth.getAccounts();
    });

    beforeEach(async () => {
        this.Staking = await StakingTokenMock.new('ST1INCH', 'ST1INCH');
        this.WhitelistRegistry = await WhitelistRegistry.new(this.Staking.address, THRESHOLD);
        await this.Staking.mint(addrs[0], ether('100'));
    });

    describe('storage vars', async () => {
        it('check storage vars', async () => {
            expect(await this.WhitelistRegistry.resolverThreshold()).to.be.bignumber.equal(THRESHOLD);
            expect(await this.WhitelistRegistry.staking()).to.equal(this.Staking.address);
        });
    });

    describe('setters', async () => {
        it('staking setter', async () => {
            await this.WhitelistRegistry.setStaking(DUMMY_ADDRESS);
            expect(await this.WhitelistRegistry.staking()).to.equal(DUMMY_ADDRESS);
        });

        it('threshold setter', async () => {
            await this.WhitelistRegistry.setResolverThreshold(toBN('0'));
            expect(await this.WhitelistRegistry.resolverThreshold()).to.be.bignumber.equal(toBN('0'));
        });
    });

    describe('register', async () => {
        it('should whitelist 10 addresses', async () => {
            for (let i = 1; i <= MAX_WHITELSITED; ++i) {
                await this.Staking.transfer(addrs[i], VOTING_POWER_THRESHOLD);
            }
            for (let i = 1; i <= MAX_WHITELSITED; ++i) {
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
            for (let i = 1; i <= MAX_WHITELSITED + 1; ++i) {
                await this.Staking.transfer(addrs[i], VOTING_POWER_THRESHOLD);
            }
            for (let i = 1; i <= MAX_WHITELSITED; ++i) {
                await this.WhitelistRegistry.register({ from: addrs[i] });
                expect(await this.WhitelistRegistry.isWhitelisted(addrs[i])).to.be.equal(true);
            }
            await expect(
                this.WhitelistRegistry.register({
                    from: addrs[MAX_WHITELSITED + 1],
                }),
            ).to.eventually.be.rejectedWith('NotEnoughBalance()');
            expect(await this.WhitelistRegistry.isWhitelisted(addrs[MAX_WHITELSITED + 1])).to.be.equal(false);
            for (let i = 1; i <= MAX_WHITELSITED; ++i) {
                await this.Staking.transfer(addrs[0], VOTING_POWER_THRESHOLD, {
                    from: addrs[i],
                });
                expect(await this.WhitelistRegistry.isWhitelisted(addrs[i])).to.be.equal(true);
            }
            await this.Staking.transfer(addrs[MAX_WHITELSITED + 1], VOTING_POWER_THRESHOLD);
            await this.WhitelistRegistry.register({
                from: addrs[MAX_WHITELSITED + 1],
            });
            expect(await this.WhitelistRegistry.isWhitelisted(addrs[MAX_WHITELSITED + 1])).to.be.equal(true);
            expect(await this.WhitelistRegistry.isWhitelisted(addrs[1])).to.be.equal(false);
            for (let i = 2; i <= MAX_WHITELSITED + 1; ++i) {
                expect(await this.WhitelistRegistry.isWhitelisted(addrs[i])).to.be.equal(true);
            }
        });

        it('should whitelist 10 addresses, then lower balance, then whitelist successfully', async () => {
            for (let i = 1; i <= MAX_WHITELSITED + 1; ++i) {
                await this.Staking.transfer(addrs[i], VOTING_POWER_THRESHOLD);
            }
            for (let i = 1; i <= MAX_WHITELSITED; ++i) {
                await this.WhitelistRegistry.register({ from: addrs[i] });
                expect(await this.WhitelistRegistry.isWhitelisted(addrs[i])).to.be.equal(true);
            }
            await this.Staking.transfer(addrs[0], toBN('1'), {
                from: addrs[3],
            });
            expect(await this.WhitelistRegistry.isWhitelisted(addrs[3])).to.be.equal(true);
            await this.WhitelistRegistry.register({
                from: addrs[MAX_WHITELSITED + 1],
            });
            expect(await this.WhitelistRegistry.isWhitelisted(addrs[MAX_WHITELSITED + 1])).to.be.equal(true);
            expect(await this.WhitelistRegistry.isWhitelisted(addrs[3])).to.be.equal(false);
        });

        it('should whitelist 10 addresses, then whitelist 9 times successfully', async () => {
            for (let i = 1; i <= MAX_WHITELSITED + 9; ++i) {
                await this.Staking.transfer(addrs[i], i <= MAX_WHITELSITED ? VOTING_POWER_THRESHOLD : VOTING_POWER_THRESHOLD.add(toBN('1')));
            }
            for (let i = 1; i <= MAX_WHITELSITED + 9; ++i) {
                await this.WhitelistRegistry.register({ from: addrs[i] });
                expect(await this.WhitelistRegistry.isWhitelisted(addrs[i])).to.be.equal(true);
            }
            let whitelisted = 0;
            for (let i = 1; i <= MAX_WHITELSITED; ++i) {
                whitelisted += await this.WhitelistRegistry.isWhitelisted(addrs[i]);
            }
            expect(whitelisted).to.be.equal(1);
        });
    });

    describe('clean', async () => {
        it('should remove from whitelist addresses which not enough staked balance', async () => {
            for (let i = 1; i <= MAX_WHITELSITED; ++i) {
                await this.Staking.transfer(addrs[i], VOTING_POWER_THRESHOLD.addn(1));
                await this.WhitelistRegistry.register({ from: addrs[i] });
                expect(await this.WhitelistRegistry.isWhitelisted(addrs[i])).to.be.equal(true);
                if (i % 2 === 0) {
                    await this.Staking.transfer(addrs[i - 1], VOTING_POWER_THRESHOLD, { from: addrs[i] });
                }
            }
            await this.WhitelistRegistry.clean();
            for (let i = 1; i <= MAX_WHITELSITED; ++i) {
                if (i % 2 === 0) {
                    expect(await this.WhitelistRegistry.isWhitelisted(addrs[i])).to.be.equal(false);
                } else {
                    expect(await this.WhitelistRegistry.isWhitelisted(addrs[i])).to.be.equal(true);
                }
            }
        });
    });
});
