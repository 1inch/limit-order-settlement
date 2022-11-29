const { ether } = require('@1inch/solidity-utils');
const { ethers } = require('hardhat');
const { shouldBehaveLikeERC20Pods } = require('@1inch/erc20-pods/test/behaviors/ERC20Pods.behavior.js');

describe('St1inch', function () {
    let addr, addr1;
    const baseExp = 999999981746376586n; // 0.1^(1/(4 years)) means 90% value loss over 4 years

    before(async function () {
        [addr, addr1] = await ethers.getSigners();
    });

    async function initContracts() {
        const TokenPermitMock = await ethers.getContractFactory('ERC20PermitMock');
        const oneInch = await TokenPermitMock.deploy('1inch', '1inch', addr.address, ether('200'));
        await oneInch.deployed();
        await oneInch.transfer(addr1.address, ether('100'));

        const maxPods = 5;
        const St1inchMock = await ethers.getContractFactory('St1inchMock');
        const st1inch = await St1inchMock.deploy(oneInch.address, baseExp, maxPods);
        await st1inch.deployed();
        await oneInch.approve(st1inch.address, ether('100'));
        await oneInch.connect(addr1).approve(st1inch.address, ether('100'));

        const PodMock = await ethers.getContractFactory('PodMock');
        const pods = [];
        for (let i = 0; i < maxPods; i++) {
            pods[i] = await PodMock.deploy(`POD_TOKEN_${i}`, `PT${i}`, st1inch.address);
            await pods[i].deployed();
        }
        const amount = ether('1');
        const erc20Pods = st1inch;
        return { erc20Pods, pods, amount };
    }

    shouldBehaveLikeERC20Pods(initContracts);
});
