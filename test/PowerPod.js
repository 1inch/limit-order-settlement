const { expect, time, ether } = require('@1inch/solidity-utils');
const { ethers } = require('hardhat');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { expBase } = require('./helpers/utils');

describe('PowerPod', function () {
    let addr, addr1;
    let accounts;
    const commonLockDuration = time.duration.days('40');
    const amountToStake = ether('1');

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

    async function initContracts() {
        const TokenPermitMock = await ethers.getContractFactory('ERC20PermitMock');
        const oneInch = await TokenPermitMock.deploy('1inch', '1inch', addr.address, ether('200'));
        await oneInch.deployed();

        const St1inch = await ethers.getContractFactory('St1inch');
        const st1inch = await St1inch.deploy(oneInch.address, expBase, addr.address);
        await st1inch.deployed();
        await oneInch.approve(st1inch.address, ether('100'));

        const PowerPod = await ethers.getContractFactory('PowerPod');
        const delegation = await PowerPod.deploy('PowerPod', 'PP', st1inch.address);
        await delegation.deployed();
        await stakeAndRegisterInDelegation(st1inch, delegation, addr, amountToStake, 0);

        return { st1inch, delegation };
    }

    before(async function () {
        accounts = await ethers.getSigners();
        addr = accounts[0];
        addr1 = accounts[1];
    });

    describe('Should calculate voting power', function () {
        it('for account with 0 balance', async function () {
            const { delegation } = await loadFixture(initContracts);
            expect(await delegation.votingPowerOf(addr1.address)).to.equal(0);
        });

        it('for account with st1inch balance', async function () {
            const { st1inch, delegation } = await loadFixture(initContracts);
            expect(await delegation.votingPowerOf(addr.address)).to.equal(await st1inch.votingPowerOf(addr.address));
        });
    });
});
