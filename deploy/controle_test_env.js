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

    const st1inch = await getContractByAddress('St1inch', '0x5bE21bfEfa718aF055653101ba84371B68562D9c');

    const delegators = deserialize(setup.delegatorsFilePath);

    for (let i = 0; i < delegators.length; ++i) {
        const delegator = delegators[i];
        const delegatorWallet = new ethers.Wallet(DELEGATORS_PRIVATE_KEYS[i]).connect(provider);
        console.log('delegator ', delegator.address);

        const pods = await st1inch.pods(delegator.address);
        for (let j = 0; j < pods.length; ++j) {
            if (pods[j] !== '0x5BaD01b11746efe378F83c33D97DD56757fef572') {
                console.log('remove pod: delegator -> ', delegator.address, 'farm -> ', pods[j]);
                await (await st1inch.connect(delegatorWallet).removePod(pods[j], {
                    maxPriorityFeePerGas: setup.maxPriorityFeePerGas,
                    gasLimit: '300000',
                }));
            }
        }
    }
};
module.exports.skip = async () => false;
