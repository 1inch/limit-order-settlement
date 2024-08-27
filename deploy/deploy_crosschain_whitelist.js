const hre = require('hardhat');
const { getChainId } = hre;
const { deployAndGetContract } = require('@1inch/solidity-utils');

const DAO_ADDRESS = '0x7951c7ef839e26F63DA87a42C9a87986507f1c07';

module.exports = async ({ getNamedAccounts, deployments }) => {
    const chainId = await getChainId();

    console.log('running deploy script');
    console.log('network id ', chainId);

    const { deployer } = await getNamedAccounts();

    const whitelistRegistry = await deployments.get('WhitelistRegistryV2');
    console.log('whitelistRegistry: ', whitelistRegistry.address);

    const whitelist = await deployAndGetContract({
        contractName: 'CrosschainWhitelistRegistry',
        constructorArgs: [whitelistRegistry.address],
        deployments,
        deployer,
        deploymentName: 'CrosschainWhitelistRegistry',
    });

    const tx = await whitelist.transferOwnership(DAO_ADDRESS);
    await tx.wait();
    console.log(`Ownership has been successfully transferred to ${DAO_ADDRESS}`);
};

module.exports.skip = async () => true;
