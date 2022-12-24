const { getChainId } = require('hardhat');
const { idempotentDeployGetContract } = require('../test/helpers/utils.js');
const { constants, ether } = require('@1inch/solidity-utils');

const INCH = {
    1: '0x111111111117dC0aa78b770fA6A738034120C302', // Mainnet
    56: '0x111111111117dC0aa78b770fA6A738034120C302', // BSC
    137: '0x9c2C5fd7b07E95EE044DDeba0E97a665F142394f', // Matic
    31337: '0x9c2C5fd7b07E95EE044DDeba0E97a665F142394f', // Hardhat
};

const expBase = '999999952502977513';

const ROUTER_V5_ADDR = '0x1111111254EEB25477B68fb85Ed929f73A960582';

module.exports = async ({ getNamedAccounts, deployments }) => {
    const chainId = await getChainId();

    console.log('running deploy script');
    console.log('network id ', chainId);

    const { deployer } = await getNamedAccounts();

    const st1inch = await idempotentDeployGetContract(
        'St1inch',
        [INCH[chainId], expBase],
        deployments,
        deployer,
        'St1inch',
        // true,
    );

    if ((await st1inch.feeReceiver()) === constants.ZERO_ADDRESS) {
        await (await st1inch.setFeeReceiver(deployer)).wait();
    }

    if ((await st1inch.maxLossRatio()).toBigInt() === 0n) {
        await (await st1inch.setMaxLossRatio('900000000')).wait(); // 90%
    }

    if ((await st1inch.minLockPeriodRatio()).toBigInt() === 0n) {
        await (await st1inch.setMinLockPeriodRatio('100000000')).wait(); // 10%
    }

    const st1inchFarm = await idempotentDeployGetContract(
        'StakingFarmingPod',
        [st1inch.address],
        deployments,
        deployer,
        'StakingFarmingPod',
        // true,
    );

    if ((await st1inch.defaultFarm()) === constants.ZERO_ADDRESS) {
        await (await st1inch.setDefaultFarm(st1inchFarm.address)).wait();
    }

    const st1inchPreview = await idempotentDeployGetContract(
        'St1inchPreview',
        [st1inch.address],
        deployments,
        deployer,
        'St1inchPreview',
        // true,
    );

    if ((await st1inchPreview.durationUntilMaxAllowedLoss()).toBigInt() === 0n) {
        await (await st1inchPreview.setDurationUntilMaxAllowedLoss(2101612)).wait();
    }

    const settlement = await idempotentDeployGetContract(
        'Settlement',
        [ROUTER_V5_ADDR, INCH[chainId]],
        deployments,
        deployer,
        'Settlement',
        // true,
    );

    const feeBankAddress = await settlement.feeBank();
    console.log('FeeBank deployed to:', feeBankAddress);

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
