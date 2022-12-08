const { getChainId } = require('hardhat');
const { getContractByAddress } = require('../test/helpers/utils.js');
const { setup } = require('../deployments/matic/test_env_setup/setup.js');

module.exports = async ({ getNamedAccounts, deployments }) => {
    const chainId = await getChainId();

    console.log('running controle script');
    console.log('network id ', chainId);

    const { deployer } = await getNamedAccounts();

    const st1inch = await getContractByAddress('St1inch', '0xF93cc6F5ac8E3071519b2c0b90FFb76a49073E3e');
    await (await st1inch.setFeeReceiver(deployer, {
        maxFeePerGas: setup[chainId].maxFeePerGas,
        maxPriorityFeePerGas: setup[chainId].maxPriorityFeePerGas,
    }));
};
module.exports.skip = async () => true;
