const fs = require('fs');
const path = require('path');
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
    const lopv4 = await deployContract('LimitOrderProtocol', [weth.address]);

    const LimitOrderProtocolV3 = JSON.parse(fs.readFileSync(path.join(__dirname, '../../artifacts-v1/LimitOrderProtocolV3.json'), 'utf8'));
    // const lopv3 = await deployContract(LimitOrderProtocolV3.abi, [weth.address]);
    const ContractFactory = await ethers.getContractFactory(LimitOrderProtocolV3.abi, LimitOrderProtocolV3.bytecode);
    const lopv3 = await ContractFactory.deploy(weth.address);
    return { dai, weth, inch, lopv3, lopv4 };
}

module.exports = {
    deployContract,
    deploySwapTokens,
    getChainId,
};
