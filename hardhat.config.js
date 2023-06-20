require('@matterlabs/hardhat-zksync-deploy');
require('@matterlabs/hardhat-zksync-solc');
require('@matterlabs/hardhat-zksync-verify');
require('@nomiclabs/hardhat-ethers');
require('@nomiclabs/hardhat-etherscan');
require('@nomicfoundation/hardhat-chai-matchers');
require('solidity-coverage');
require('hardhat-dependency-compiler');
require('hardhat-deploy');
require('hardhat-gas-reporter');
require('hardhat-tracer');
require('dotenv').config();

const { networks, etherscan } = require('./hardhat.networks');

function getNetwork() {
    const index = process.argv.findIndex((arg) => arg === '--network') + 1;
    return index !== 0 ? process.argv[index] : undefined;
}

const DEFAULT_COMPILER_SETTINGS = {
    version: '0.8.20',
    settings: {
        optimizer: {
            enabled: true,
            runs: 1000000,
        },
        evmVersion: networks[getNetwork()]?.hardfork || 'shanghai',
        viaIR: true,
    },
};

const PREV_SOLC_COMPILER_SETTINGS = structuredClone(DEFAULT_COMPILER_SETTINGS);
PREV_SOLC_COMPILER_SETTINGS.version = '0.8.19';
PREV_SOLC_COMPILER_SETTINGS.settings.evmVersion = 'paris';

const LOW_OPTIMIZER_COMPILER_SETTINGS = structuredClone(PREV_SOLC_COMPILER_SETTINGS);
LOW_OPTIMIZER_COMPILER_SETTINGS.settings.optimizer.runs = 200;

module.exports = {
    etherscan,
    tracer: {
        enableAllOpcodes: true,
    },
    solidity: {
        compilers: [DEFAULT_COMPILER_SETTINGS, PREV_SOLC_COMPILER_SETTINGS],
        overrides: {
            '@1inch/limit-order-protocol-contract/contracts/LimitOrderProtocol.sol': LOW_OPTIMIZER_COMPILER_SETTINGS,
            'contracts/hardhat-dependency-compiler/@1inch/limit-order-protocol-contract/contracts/LimitOrderProtocol.sol': LOW_OPTIMIZER_COMPILER_SETTINGS,
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
            '@1inch/st1inch/contracts/St1inch.sol',
            '@1inch/limit-order-protocol-contract/contracts/LimitOrderProtocol.sol',
            '@1inch/limit-order-protocol-contract/contracts/mocks/WrappedTokenMock.sol',
        ],
    },
    zksolc: {
        version: '1.3.7',
        compilerSource: 'binary',
        settings: {},
    },
};
