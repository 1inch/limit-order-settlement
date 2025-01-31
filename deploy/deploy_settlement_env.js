const hre = require('hardhat');
const { getChainId, ethers } = hre;
const { deployAndGetContract } = require('@1inch/solidity-utils');

const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const ST1INCH_ADDR = '0x9A0C8Ff858d273f57072D714bca7411D717501D7';
const ROUTER_V6_ADDR = '0x111111125421ca6dc452d289314280a0f8842a65';

module.exports = async ({ getNamedAccounts, deployments }) => {
    const chainId = await getChainId();

    console.log('running deploy script');
    console.log('network id ', chainId);

    const { deployer } = await getNamedAccounts();

    const st1inch = (await ethers.getContractFactory('St1inch')).attach(ST1INCH_ADDR);
    const accessToken = (await deployments.get('KycNFT')).address;

    await deployAndGetContract({
        contractName: 'Settlement',
        constructorArgs: [ROUTER_V6_ADDR, accessToken, WETH, deployer],
        deployments,
        deployer,
    });

    const delegation = await deployAndGetContract({
        contractName: 'PowerPod',
        constructorArgs: ['Delegated st1INCH', 'dst1INCH', await st1inch.getAddress()],
        deployments,
        deployer,
    });

    await deployAndGetContract({
        contractName: 'ResolverMetadata',
        constructorArgs: [await delegation.getAddress()],
        deployments,
        deployer,
    });

    await deployAndGetContract({
        contractName: 'WhitelistRegistry',
        constructorArgs: [await delegation.getAddress(), '1000'], // 1000 = 10% threshold
        deployments,
        deployer,
    });
};

module.exports.skip = async () => true;
