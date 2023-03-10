require('@nomiclabs/hardhat-ethers');
require('@nomiclabs/hardhat-etherscan');
require('@nomicfoundation/hardhat-chai-matchers');
require('solidity-coverage');
require('hardhat-dependency-compiler');
require('hardhat-deploy');
require('hardhat-gas-reporter');
require('dotenv').config();

const { networks, etherscan } = require('./hardhat.networks');

const DEFAULT_COMPILER_SETTINGS = {
    version: '0.8.19',
    settings: {
        optimizer: {
            enabled: true,
            runs: 1000000,
        },
        viaIR: true,
    },
};

const LOW_OPTIMIZER_COMPILER_SETTINGS = {
    version: '0.8.19',
    settings: {
        optimizer: {
            enabled: true,
            runs: 10000,
        },
    },
};

module.exports = {
    etherscan,
    solidity: {
        compilers: [DEFAULT_COMPILER_SETTINGS],
        overrides: {
            'contracts/PowerPod.sol': LOW_OPTIMIZER_COMPILER_SETTINGS,
        },
    },
    networks,
    namedAccounts: {
        deployer: {
            default: 0,
        },
    },
    gasReporter: {
        enable: true,
    },
    dependencyCompiler: {
        paths: [
            '@1inch/solidity-utils/contracts/mocks/TokenMock.sol',
            '@1inch/solidity-utils/contracts/mocks/ERC20PermitMock.sol',
            '@1inch/erc20-pods/contracts/mocks/PodMock.sol',
            '@1inch/erc20-pods/contracts/mocks/WrongPodMock.sol',
            '@1inch/farming/contracts/FarmingPod.sol',
            '@1inch/limit-order-protocol-contract/contracts/LimitOrderProtocol.sol',
            '@1inch/limit-order-protocol-contract/contracts/mocks/WrappedTokenMock.sol',
            '@openzeppelin/contracts/token/ERC20/extensions/draft-ERC20Permit',
        ],
    },
};
