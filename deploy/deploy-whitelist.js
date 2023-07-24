const hre = require('hardhat');
const { getChainId } = hre;
const { idempotentDeployGetContract } = require('../test/helpers/utils.js');

const DAO_ADDRESS = '0x7951c7ef839e26F63DA87a42C9a87986507f1c07'

module.exports = async ({ getNamedAccounts, deployments }) => {
    const chainId = await getChainId();

    console.log('running deploy script');
    console.log('network id ', chainId);

    const { deployer } = await getNamedAccounts();

    const delegation = await deployments.get('PowerPod');
    console.log('delegation: ', delegation.address);

    const whitelist = await idempotentDeployGetContract(
        'WhitelistRegistry',
        // 1000 = 10% threshold
        [delegation.address, '1000'],
        deployments,
        deployer,
        'WhitelistRegistryV2',
        // true,
    );

    const tx = await whitelist.transferOwnership(DAO_ADDRESS);
    await tx.wait();
    console.log(`Ownership has been successfully transferred to ${DAO_ADDRESS}`)
};

module.exports.skip = async () => true;
