const { expect, ether } = require('@1inch/solidity-utils');
const { addr0Wallet, addr1Wallet } = require('./helpers/utils');

const SolvingDelegationToken = artifacts.require('SolvingDelegationToken');

describe('SolvingDelegationToken', async () => {
    const [addr0, addr1] = [addr0Wallet.getAddressString(), addr1Wallet.getAddressString()];

    beforeEach(async () => {
        this.token = await SolvingDelegationToken.new('SolvingToken', 'SDT', '5');

        await this.token.mint(addr0, ether('1'));
    });

    describe('ERC20 overrides', async () => {
        it('should not transfer', async () => {
            await expect(this.token.transfer(addr1, ether('1'))).to.eventually.be.rejectedWith('MethodDisabled()');
        });

        it('should not transferFrom', async () => {
            await expect(
                this.token.transferFrom(addr0, addr1, ether('1'), { from: addr1 }),
            ).to.eventually.be.rejectedWith('MethodDisabled()');
        });

        it('should not approve', async () => {
            await expect(this.token.approve(addr1, ether('1'))).to.eventually.be.rejectedWith('MethodDisabled()');
        });
    });
});
