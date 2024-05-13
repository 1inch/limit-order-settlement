require('@matterlabs/hardhat-zksync-deploy');
require('@matterlabs/hardhat-zksync-solc');
require('@matterlabs/hardhat-zksync-verify');
require('@nomicfoundation/hardhat-verify');
require('@nomicfoundation/hardhat-chai-matchers');
require('solidity-coverage');
require('hardhat-dependency-compiler');
require('hardhat-deploy');
require('hardhat-gas-reporter');
require('hardhat-tracer');
require('dotenv').config();
const { Networks, getNetwork } = require('@1inch/solidity-utils/hardhat-setup');

const { networks, etherscan } = (new Networks()).registerAll();
networks.hardhat = Object.assign(networks.hardhat, {
    initialBaseFeePerGas: 1,
    gasPrice: 1,
});

const DEFAULT_COMPILER_SETTINGS = {
    version: '0.8.23',
    settings: {
        optimizer: {
            enabled: true,
            runs: 1000000,
        },
        evmVersion: networks[getNetwork()]?.hardfork || 'shanghai',
        viaIR: true,
    },
};

const LOW_OPTIMIZER_COMPILER_SETTINGS = JSON.parse(JSON.stringify(DEFAULT_COMPILER_SETTINGS));
LOW_OPTIMIZER_COMPILER_SETTINGS.settings.optimizer.runs = 200;

module.exports = {
    etherscan,
    tracer: {
        enableAllOpcodes: true,
    },
    solidity: {
        compilers: [DEFAULT_COMPILER_SETTINGS],
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
            '@1inch/st1inch/contracts/St1inch.sol',
            '@1inch/limit-order-protocol-contract/contracts/LimitOrderProtocol.sol',
            '@1inch/limit-order-protocol-contract/contracts/mocks/WrappedTokenMock.sol',
        ],
    },
    zksolc: {
        version: '1.4.1',
        compilerSource: 'binary',
        settings: {},
    },
};
