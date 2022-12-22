const { getChainId, ethers } = require('hardhat');
const { idempotentDeployGetContract, getContractByAddress } = require('../test/helpers/utils.js');
// const { setup } = require('../deployments/matic/test_env_setup/setup.js');
const { networks } = require('../hardhat.networks');

const ROUTER_V5_ADDR = '0x1111111254EEB25477B68fb85Ed929f73A960582';
const INCH_TOKEN = '0x111111111117dC0aa78b770fA6A738034120C302';

module.exports = async ({ getNamedAccounts, deployments }) => {
    const chainId = await getChainId();

    console.log('running controle script');
    console.log('network id ', chainId);

    const { deployer } = await getNamedAccounts();

    const provider = new ethers.providers.JsonRpcProvider(networks[deployments.getNetworkName()].url);
    const feeData = await provider.getFeeData();

    await idempotentDeployGetContract(
        'Settlement',
        [ROUTER_V5_ADDR, INCH_TOKEN],
        deployments,
        deployer,
        feeData,
        'Settlement',
        true,
    );

    const settlement = await getContractByAddress('Settlement', '0x8330Ea89097cd8c099Ff531B6aEd75E0b70262BA');

    const feeBankAddress = await settlement.feeBank();
    console.log('feeBankAddress', feeBankAddress);
};
module.exports.skip = async () => true;
