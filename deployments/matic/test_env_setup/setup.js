const { ether } = require('@1inch/solidity-utils');

const setup = {
    delegatorsFilePath: './deployments/matic/test_env_setup/delegators.json',
    resolversFilePath: './deployments/matic/test_env_setup/resolvers.json',
    deployOldResolvers: false,
    deployResolvers: false,
    deployFarms: false,
    deployDelegators: false,
    1: {
        maxPriorityFeePerGas: '100000000',
        minBalance: ether('0.009'),
        addedBalance: ether('0.1'),
    },
    137: {
        maxPriorityFeePerGas: '45000000000',
        minBalance: ether('0.4'),
        addedBalance: ether('0.5'),
    },
    promote: {
        enable: true,
        address: '0x3E4798B0e268bB73c04e29afe0bc7FdCF37B67c1',
        stake: ether('10000'),
    },
    returnFee: false,
    deployerPrivateKey: process.env.MATIC_PRIVATE_KEY,
    feeRecive: {
        percent: '500000000', // 50%
    },
};

module.exports = {
    setup,
};
