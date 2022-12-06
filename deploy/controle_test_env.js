const { ether, constants } = require('@1inch/solidity-utils');
const { getChainId, ethers } = require('hardhat');
const { getContract } = require('../test/helpers/utils.js');
const { networks } = require('../hardhat.networks');

const setup = {
    maxFeePerGas: '17000000000',
    maxPriorityFeePerGas: '100000000',
    deployerPrivateKey: process.env.MAINNET_PRIVATE_KEY,
};

module.exports = async ({ getNamedAccounts, deployments }) => {
    const chainId = await getChainId();

    console.log('running controle script');
    console.log('network id ', chainId);

    const provider = new ethers.providers.JsonRpcProvider(networks[deployments.getNetworkName()].url);
    let feeData = await provider.getFeeData();

    // const { deployer } = await getNamedAccounts();

    const st1inch = await getContract('St1inch', deployments);
    await (await st1inch.setMaxLossRatio('1000000000')).wait();
};
module.exports.skip = async () => true;
