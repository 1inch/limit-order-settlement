const { ethers } = require('hardhat');
const { ether } = require('@1inch/solidity-utils');

async function getChainId() {
    return (await ethers.provider.getNetwork()).chainId;
}

async function deployContract(contractFactoryName, params = []) {
    const Contract = await ethers.getContractFactory(contractFactoryName);
    const contract = await Contract.deploy(...params);
    await contract.deployed();
    return contract;
}

async function deploySwapTokens() {
    const [account] = await ethers.getSigners();
    const dai = await deployContract('ERC20PermitMock', ['DAI', 'DAI', account.address, ether('1000')]);
    const weth = await deployContract('WrappedTokenMock', ['WETH', 'WETH']);
    const inch = await deployContract('TokenMock', ['1INCH', '1INCH']);
    const swap = await deployContract('LimitOrderProtocol', [weth.address]);
    return { dai, weth, inch, swap };
}

async function deploySimpleRegistry() {
    const WhitelistRegistrySimple = await ethers.getContractFactory('WhitelistRegistrySimple');
    const whitelistRegistrySimple = await WhitelistRegistrySimple.deploy();
    await whitelistRegistrySimple.deployed();
    return whitelistRegistrySimple;
}

module.exports = {
    deployContract,
    deploySimpleRegistry,
    deploySwapTokens,
    getChainId,
};
