const { ether } = require('@1inch/solidity-utils');

const setup = {
    delegatorsFilePath: './deployments/matic/test_env_setup/delegators.json',
    resolversFilePath: './deployments/matic/test_env_setup/resolvers.json',
    deployOldResolvers: false,
    deployResolvers: false,
    deployFarms: false,
    deployDelegators: false,
    1: {
        maxFeePerGas: '15000000000',
        maxPriorityFeePerGas: '100000000',
        minBalance: ether('0.009'),
        addedBalance: ether('0.1'),
        deployerPrivateKey: process.env.MAINNET_PRIVATE_KEY,
    },
    137: {
        maxFeePerGas: '65000000000',
        maxPriorityFeePerGas: '45000000000',
        minBalance: ether('0.4'),
        addedBalance: ether('0.5'),
        deployerPrivateKey: process.env.MATIC_PRIVATE_KEY,
    },
    promote: {
        enable: true,
        address: '0x3E4798B0e268bB73c04e29afe0bc7FdCF37B67c1',
        stake: ether('10000'),
    },
    returnFee: false,
    feeRecive: {
        percent: '500000000', // 50%
    },
};

module.exports = {
    setup,
};