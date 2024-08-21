const hre = require('hardhat');
const { getChainId, network } = hre;
const { deployAndGetContractWithCreate3, deployAndGetContract } = require('@1inch/solidity-utils');

module.exports = async ({ getNamedAccounts, deployments }) => {
    console.log('running deploy script: kyc-nft');
    console.log('network id ', await getChainId());

    if (network.name.indexOf('zksync') !== -1) {
        // Deploy on zkSync-like networks without create3
        const { deployer } = await getNamedAccounts();
        await deployAndGetContract({
            contractName: 'KycNFT',
            constructorArgs: ['Resolver Access Token', 'RES', '0x56E44874F624EbDE6efCc783eFD685f0FBDC6dcF'],
            deployments,
            deployer,
        });
    } else {
        // Deploy with create3
        await deployAndGetContractWithCreate3({
            contractName: 'KycNFT',
            constructorArgs: ['Resolver Access Token', 'RES', '0x56E44874F624EbDE6efCc783eFD685f0FBDC6dcF'],
            create3Deployer: '0xD935a2bb926019E0ed6fb31fbD5b1Bbb7c05bf65',
            salt: '0x6a836dae74a446aa8cb5d26951222246d1cad2d4a744b961f7986bf35f4d35d7',
            deployments,
            skipVerify: network.name === 'klaytn',
        });
    }
};

module.exports.skip = async () => true;
