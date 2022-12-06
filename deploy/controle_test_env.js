const { getChainId, ethers } = require('hardhat');
const { getContractByAddress } = require('../test/helpers/utils.js');
const { networks } = require('../hardhat.networks');
const fs = require('fs');

const setup = {
    maxPriorityFeePerGas: '40000000000',
    deployerPrivateKey: process.env.MATIC_PRIVATE_KEY,
    delegatorsFilePath: './deployments/matic/test_env_setup/delegators.json',
    resolversFilePath: './deployments/matic/test_env_setup/resolvers.json',
};

const deserialize = (path) => {
    return JSON.parse(
        fs.readFileSync(path),
        (key, value) =>
            ['stake', 'reward'].includes(key)
                ? BigInt(value)
                : value,
    );
};

const DELEGATORS_PRIVATE_KEYS = process.env.DELEGATORS.split(', ');

module.exports = async ({ getNamedAccounts, deployments }) => {
    const chainId = await getChainId();

    console.log('running controle script');
    console.log('network id ', chainId);

    const provider = new ethers.providers.JsonRpcProvider(networks[deployments.getNetworkName()].url);

    const { deployer } = await getNamedAccounts();

    const st1inch = await getContractByAddress('St1inch', '0xF93cc6F5ac8E3071519b2c0b90FFb76a49073E3e');
    await (await st1inch.setFeeReceiver(deployer));
};
module.exports.skip = async () => false;
