const hre = require('hardhat');
const { getChainId, ethers } = hre;
const { idempotentDeployGetContract } = require('../test/helpers/utils.js');
const { ether } = require('@1inch/solidity-utils');

const INCH_ADDR = '0x111111111117dC0aa78b770fA6A738034120C302';
const ST1INCH_ADDR = '0x9A0C8Ff858d273f57072D714bca7411D717501D7';
const ROUTER_V5_ADDR = '0x1111111254EEB25477B68fb85Ed929f73A960582';

module.exports = async ({ getNamedAccounts, deployments }) => {
    const chainId = await getChainId();

    console.log('running deploy script');
    console.log('network id ', chainId);

    const { deployer } = await getNamedAccounts();

    const st1inch = (await ethers.getContractFactory('St1inch')).attach(ST1INCH_ADDR);

    const settlement = await idempotentDeployGetContract(
        'Settlement',
        [ROUTER_V5_ADDR, INCH_ADDR],
        deployments,
        deployer,
        'Settlement',
        // true,
    );

    const feeBankAddress = await settlement.feeBank();
    console.log('FeeBank deployed to:', feeBankAddress);

    if (chainId !== '31337') {
        await hre.run('verify:verify', {
            address: feeBankAddress,
            constructorArguments: [settlement.address, INCH_ADDR, deployer],
        });
    }

    const delegation = await idempotentDeployGetContract(
        'PowerPod',
        ['Delegated st1INCH', 'dst1INCH', st1inch.address],
        deployments,
        deployer,
        'PowerPod',
        // true,
    );

    /* const resolverMetadata = */ await idempotentDeployGetContract(
        'ResolverMetadata',
        [delegation.address],
        deployments,
        deployer,
        'ResolverMetadata',
        // true,
    );

    const whitelist = await idempotentDeployGetContract(
        'WhitelistRegistry',
        [delegation.address, ether('100').toString(), '5'],
        deployments,
        deployer,
        'WhitelistRegistry',
        // true,
    );

    /* const whitelistHelper = */ await idempotentDeployGetContract(
        'WhitelistHelper',
        [whitelist.address],
        deployments,
        deployer,
        'WhitelistHelper',
        // true,
    );
};

module.exports.skip = async () => true;
