const { getChainId, ethers } = require('hardhat');
const { idempotentDeployGetContract } = require('../test/helpers/utils.js');
const { networks } = require('../hardhat.networks');

const INCH = {
    1: '0x111111111117dC0aa78b770fA6A738034120C302', // Mainnet
    137: '0x9c2C5fd7b07E95EE044DDeba0E97a665F142394f', // Matic
};

const ROUTER_V5_ADDR = '0x1111111254EEB25477B68fb85Ed929f73A960582';

module.exports = async ({ getNamedAccounts, deployments }) => {
    const chainId = await getChainId();

    console.log('running deploy script');
    console.log('network id ', chainId);

    const { deployer } = await getNamedAccounts();

    const provider = new ethers.providers.JsonRpcProvider(networks[deployments.getNetworkName()].url);
    const feeData = await provider.getFeeData();

    const settlement = await idempotentDeployGetContract(
        'Settlement',
        [ROUTER_V5_ADDR, INCH[chainId]],
        deployments,
        deployer,
        feeData,
        'Settlement',
        true,
    );

    const feeBankAddress = await settlement.feeBank();
    console.log('feeBankAddress', feeBankAddress);
};

module.exports.skip = async () => true;
