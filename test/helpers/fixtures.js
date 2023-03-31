const { ethers } = require('hardhat');
const { ether } = require('@1inch/solidity-utils');

async function getChainId() {
    return (await ethers.provider.getNetwork()).chainId;
}

async function deploySwapTokens() {
    const [account] = await ethers.getSigners();
    const TokenMock = await ethers.getContractFactory('TokenMock');
    const ERC20PermitMock = await ethers.getContractFactory('ERC20PermitMock');
    const dai = await ERC20PermitMock.deploy('DAI', 'DAI', account.address, ether('1000'));
    await dai.deployed();
    const WrappedTokenMock = await ethers.getContractFactory('WrappedTokenMock');
    const weth = await WrappedTokenMock.deploy('WETH', 'WETH');
    await weth.deployed();
    const inch = await TokenMock.deploy('1INCH', '1INCH');
    await inch.deployed();
    const LimitOrderProtocol = await ethers.getContractFactory('LimitOrderProtocol');
    const swap = await LimitOrderProtocol.deploy(weth.address);
    await swap.deployed();
    return { dai, weth, inch, swap };
}

async function deploySwap(tokenAddress) {
    const LimitOrderProtocol = await ethers.getContractFactory('LimitOrderProtocol');
    const swap = await LimitOrderProtocol.deploy(tokenAddress);
    await swap.deployed();
    return swap;
}

async function deploySimpleRegistry() {
    const WhitelistRegistrySimple = await ethers.getContractFactory('WhitelistRegistrySimple');
    const whitelistRegistrySimple = await WhitelistRegistrySimple.deploy();
    await whitelistRegistrySimple.deployed();
    return whitelistRegistrySimple;
}

module.exports = {
    deploySimpleRegistry,
    deploySwap,
    deploySwapTokens,
    getChainId,
};
