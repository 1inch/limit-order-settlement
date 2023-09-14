const { ethers } = require('hardhat');
const { ether, deployContract } = require('@1inch/solidity-utils');

async function getChainId() {
    return (await ethers.provider.getNetwork()).chainId;
}

async function deploySwapTokens() {
    const [account] = await ethers.getSigners();
    const dai = await deployContract('ERC20PermitMock', ['DAI', 'DAI', account.address, ether('1000')]);
    const weth = await deployContract('WrappedTokenMock', ['WETH', 'WETH']);
    const inch = await deployContract('TokenMock', ['1INCH', '1INCH']);
    const swap = await deployContract('LimitOrderProtocol', [weth.address]);
    return { dai, weth, inch, swap };
}

module.exports = {
    deployContract,
    deploySwapTokens,
    getChainId,
};
