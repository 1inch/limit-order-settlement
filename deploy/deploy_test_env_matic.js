const { ether, constants } = require('@1inch/solidity-utils');
const { getChainId, ethers } = require('hardhat');
const { idempotentDeployGetContract } = require('../test/helpers/utils.js');
const { networks } = require('../hardhat.networks');
const fs = require('fs');

const BASE_EXP = '999999981746376586';

const setup = {
    delegatorsFilePath: './deployments/matic/test_env_setup/delegators.json',
    resolversFilePath: './deployments/matic/test_env_setup/resolvers.json',
    deployOldResolvers: false,
    deployResolvers: false,
    deployFarms: false,
    deployDelegators: false,
    maxFeePerGas: '17000000000',
    maxPriorityFeePerGas: '100000000',
    returnFee: false,
    deployerPrivateKey: process.env.MAINNET_PRIVATE_KEY,
};

const oldResolvers = [
    {
        address: '0x21e06E695c39C2634245300d33CC6486BE326C8e',
        stake: ether('100000'),
    },
    {
        address: '0xF8157c9e721d345f6c7bc092cE5819f37313eBA3',
        stake: ether('100000'),
    },
    {
        address: '0x9E2AF6D683AF03F68b1Ba1A70a641E2ae293711A',
        stake: ether('90000'),
    },
    {
        address: '0xB06AcCe0d74579987170e91688f75178Affb03F9',
        stake: ether('80000'),
    },
    {
        address: '0x8aF9a0089Fee80cF188aF59Cd0134556f7831138',
        stake: ether('70000'),
    },
];

const OLD_RESOLVERS_PRIVATE_KEYS = process.env.OLD_RESOLVERS.split(', ');
const RESOLVERS_PRIVATE_KEYS = process.env.RESOLVERS.split(', ');
const DELEGATORS_PRIVATE_KEYS = process.env.DELEGATORS.split(', ');

const serialize = (data, path) => {
    fs.writeFileSync(
        path,
        JSON.stringify(data, (key, value) =>
            typeof value === 'bigint'
                ? value.toString()
                : value,
        2));
};

const deserialize = (path) => {
    return JSON.parse(
        fs.readFileSync(path),
        (key, value) =>
            ['stake', 'reward'].includes(key)
                ? BigInt(value)
                : value,
    );
};

module.exports = async ({ getNamedAccounts, deployments }) => {
    const chainId = await getChainId();

    console.log('running deploy script');
    console.log('network id ', chainId);

    const delegators = deserialize(setup.delegatorsFilePath);
    const resolvers = deserialize(setup.resolversFilePath);

    const provider = new ethers.providers.JsonRpcProvider(networks[deployments.getNetworkName()].url);
    let feeData = await provider.getFeeData();

    const { deployer } = await getNamedAccounts();

    const fake1Inch = await idempotentDeployGetContract(
        'ERC20PermitMock',
        ['MockInch', 'MKCH', deployer, 0],
        deployments,
        deployer,
        feeData,
        'Mock1inch',
        true,
    );
    feeData = await provider.getFeeData();

    const rewardToken = await idempotentDeployGetContract(
        'ERC20PermitMock',
        ['someOtherToken', 'SOTKN', deployer, 0],
        deployments,
        deployer,
        feeData,
        'SomeOtherToken',
        true,
    );
    feeData = await provider.getFeeData();

    const prevSt1inch = await idempotentDeployGetContract(
        'GovernanceMothership',
        [fake1Inch.address],
        deployments,
        deployer,
        feeData,
        'GovernanceMothership',
        true,
    );
    feeData = await provider.getFeeData();

    const maxPods = 5;
    const st1inch = await idempotentDeployGetContract(
        'St1inch',
        [fake1Inch.address, BASE_EXP, maxPods.toString()],
        deployments,
        deployer,
        feeData,
        'St1inch',
        true,
    );
    feeData = await provider.getFeeData();

    /* const st1inchPreview = */ await idempotentDeployGetContract(
        'St1inchPreview',
        [st1inch.address],
        deployments,
        deployer,
        feeData,
        'St1inchPreview',
        true,
    );
    feeData = await provider.getFeeData();

    const delegation = await idempotentDeployGetContract(
        'RewardableDelegationPodWithVotingPower',
        ['Rewardable', 'RWD', st1inch.address],
        deployments,
        deployer,
        feeData,
        'RewardableDelegationPodWithVotingPower',
        true,
    );
    feeData = await provider.getFeeData();

    /* const resolverMetadata = */ await idempotentDeployGetContract(
        'ResolverMetadata',
        [delegation.address],
        deployments,
        deployer,
        feeData,
        'ResolverMetadata',
        true,
    );
    feeData = await provider.getFeeData();

    const threshold = ether('0.1');
    const MAX_WHITELISTED = 5n;
    const whitelist = await idempotentDeployGetContract(
        'WhitelistRegistry',
        [delegation.address, threshold.toString(), MAX_WHITELISTED.toString()],
        deployments,
        deployer,
        feeData,
        'WhitelistRegistry',
        true,
    );
    feeData = await provider.getFeeData();

    /* const whitelistHelper = */ await idempotentDeployGetContract(
        'WhitelistHelper',
        [whitelist.address],
        deployments,
        deployer,
        feeData,
        'WhitelistHelper',
        true,
    );

    const deployerWallet = new ethers.Wallet(setup.deployerPrivateKey).connect(provider);

    if (setup.deployOldResolvers) {
        for (let i = 0; i < oldResolvers.length; ++i) {
            const resolver = oldResolvers[i];
            console.log(`old resolvers[${i}] address:`, resolver.address);

            const wallet = new ethers.Wallet(OLD_RESOLVERS_PRIVATE_KEYS[i]).connect(provider);
            feeData = await provider.getFeeData();

            if (
                (await fake1Inch.balanceOf(resolver.address)).toBigInt() === 0n &&
                (await st1inch.depositors(resolver.address)).amount.toBigInt() === 0n
            ) {
                await (await fake1Inch.mint(resolver.address, resolver.stake.toString())).wait();
            }
            console.log('mint');

            if ((await provider.getBalance(resolver.address)).toBigInt() < ether('0.009')) {
                await (
                    await deployerWallet.sendTransaction({
                        to: resolver.address,
                        value: ether('0.1'),
                        maxFeePerGas: setup.maxFeePerGas,
                        maxPriorityFeePerGas: setup.maxPriorityFeePerGas,
                    })
                ).wait();
            }
            console.log('sendTransaction');
            feeData = await provider.getFeeData();

            if ((await prevSt1inch.balanceOf(resolver.address)).toBigInt() < resolver.stake) {
                const depositAmount = resolver.stake - (await prevSt1inch.balanceOf(resolver.address)).toBigInt();
                await (
                    await fake1Inch.connect(wallet).approve(prevSt1inch.address, depositAmount.toString(), {
                        maxFeePerGas: setup.maxFeePerGas,
                        maxPriorityFeePerGas: setup.maxPriorityFeePerGas,
                        gasLimit: '300000',
                    })
                ).wait();
                console.log('approve');

                await (
                    await prevSt1inch.connect(wallet).stake(depositAmount, {
                        maxFeePerGas: setup.maxFeePerGas,
                        maxPriorityFeePerGas: setup.maxPriorityFeePerGas,
                        gasLimit: '300000',
                    })
                ).wait();
            }

            if (setup.returnFee) {
                const balance = (await provider.getBalance(resolver.address)).toBigInt();
                if (balance > 0n) {
                    const balance = balance - BigInt(setup.maxPriorityFeePerGas);
                    await (
                        await wallet.sendTransaction({
                            to: process.env.MAINNET_DEPLOYER,
                            value: balance,
                            maxFeePerGas: setup.maxPriorityFeePerGas,
                            maxPriorityFeePerGas: setup.maxPriorityFeePerGas,
                        })
                    ).wait();
                }
            }
            console.log(`resolvers[${i}] complite`);
        }
    }

    if (setup.deployResolvers) {
        for (let i = 0; i < 7;/* resolvers.length */ ++i) {
            const resolver = resolvers[i];
            console.log(`resolvers[${i}] address:`, resolver.address);

            const wallet = new ethers.Wallet(RESOLVERS_PRIVATE_KEYS[i]).connect(provider);
            feeData = await provider.getFeeData();

            if (
                (await fake1Inch.balanceOf(resolver.address)).toBigInt() === 0n &&
                (await st1inch.depositors(resolver.address)).amount.toBigInt() === 0n
            ) {
                await (await fake1Inch.mint(resolver.address, resolver.stake.toString())).wait();
            }
            console.log('mint');

            if ((await provider.getBalance(resolver.address)).toBigInt() < ether('0.009')) {
                await (
                    await deployerWallet.sendTransaction({
                        to: resolver.address,
                        value: ether('0.1'),
                        maxFeePerGas: setup.maxFeePerGas,
                        maxPriorityFeePerGas: setup.maxPriorityFeePerGas,
                    })
                ).wait();
            }
            console.log('sendTransaction');
            feeData = await provider.getFeeData();

            if ((await st1inch.depositors(resolver.address)).amount.toBigInt() < resolver.stake) {
                const depositAmount = resolver.stake - (await st1inch.depositors(resolver.address)).amount.toBigInt();
                await (
                    await fake1Inch.connect(wallet).approve(st1inch.address, depositAmount.toString(), {
                        maxFeePerGas: setup.maxFeePerGas,
                        maxPriorityFeePerGas: setup.maxPriorityFeePerGas,
                        gasLimit: '300000',
                    })
                ).wait();
                console.log('approve');

                await (
                    await st1inch.connect(wallet).deposit(depositAmount, resolver.lockTime, {
                        maxFeePerGas: setup.maxFeePerGas,
                        maxPriorityFeePerGas: setup.maxPriorityFeePerGas,
                        gasLimit: '300000',
                    })
                ).wait();
            }
            console.log('deposit');
            feeData = await provider.getFeeData();

            if (!(await st1inch.hasPod(resolver.address, delegation.address))) {
                await (
                    await st1inch
                        .connect(wallet)
                        .addPod(delegation.address, {
                            maxFeePerGas: setup.maxFeePerGas,
                            maxPriorityFeePerGas: setup.maxPriorityFeePerGas,
                            gasLimit: '300000',
                        })
                ).wait();
            }
            console.log('addPod');

            if ((await delegation.registration(resolver.address)) === constants.ZERO_ADDRESS) {
                await (
                    await delegation
                        .connect(wallet)
                        .functions['register(string,string,uint256)'](
                            `${i}DelegatingToken`,
                            `A${i}DT`,
                            maxPods,
                            {
                                maxFeePerGas: setup.maxFeePerGas,
                                maxPriorityFeePerGas: setup.maxPriorityFeePerGas,
                                gasLimit: '1750000',
                            },
                        )
                ).wait();
            }
            console.log('register');
            feeData = await provider.getFeeData();

            if ((await delegation.delegated(resolver.address)) !== resolver.address) {
                await (
                    await delegation
                        .connect(wallet)
                        .delegate(resolver.address, {
                            maxFeePerGas: setup.maxFeePerGas,
                            maxPriorityFeePerGas: setup.maxPriorityFeePerGas,
                            gasLimit: '300000',
                        })
                ).wait();
            }
            console.log('delegated');

            if (BigInt(i) < MAX_WHITELISTED) {
                const whitelistAddresses = await whitelist.getWhitelist();
                if (!whitelistAddresses.includes(resolver.address)) {
                    await (
                        await whitelist
                            .connect(wallet)
                            .register({
                                maxFeePerGas: setup.maxFeePerGas,
                                maxPriorityFeePerGas: setup.maxPriorityFeePerGas,
                                gasLimit: '300000',
                            })
                    ).wait();
                }
                console.log('whitelist register');
            }

            // if ((await resolverMetadata.getUrl(resolver.address)) === '') {
            //     await (await resolverMetadata.setResolverUrl(resolver.url)).wait();
            // }

            if (setup.returnFee) {
                const balance = (await provider.getBalance(resolver.address)).toBigInt();
                if (balance > 0n) {
                    const balance = balance - BigInt(setup.maxPriorityFeePerGas);
                    await (
                        await wallet.sendTransaction({
                            to: process.env.MAINNET_DEPLOYER,
                            value: balance,
                            maxFeePerGas: setup.maxPriorityFeePerGas,
                            maxPriorityFeePerGas: setup.maxPriorityFeePerGas,
                        })
                    ).wait();
                }
            }
            console.log(`resolvers[${i}] complite`);
        }
    }

    const ShareToken = await ethers.getContractFactory('DelegatedShare');
    if (setup.deployFarms) {
        for (let i = 0; i < 7;/* resolvers.length */ ++i) {
            const resolver = resolvers[i];
            console.log(`farm for resolvers[${i}] address:`, resolver.address);

            const wallet = new ethers.Wallet(RESOLVERS_PRIVATE_KEYS[i]).connect(provider);
            feeData = await provider.getFeeData();

            const shareTokenAddress = await delegation.registration(resolver.address);

            const farm = await idempotentDeployGetContract(
                'FarmingPod',
                [shareTokenAddress, rewardToken.address],
                deployments,
                deployer,
                feeData,
                `Farm_${i}`,
                true,
            );

            resolvers[i].farm = farm.address;
            serialize(resolvers, setup.resolversFilePath);
            console.log('serialize');
            feeData = await provider.getFeeData();

            if ((await farm.distributor()) !== resolver.address) {
                await (await farm.setDistributor(resolver.address)).wait();
            }
            console.log('setDistributor');

            if ((await delegation.defaultFarms(resolver.address)) !== farm.address) {
                await (await delegation.connect(wallet).setDefaultFarm(farm.address, {
                    maxFeePerGas: setup.maxFeePerGas,
                    maxPriorityFeePerGas: setup.maxPriorityFeePerGas,
                    gasLimit: '300000',
                })).wait();
            }
            console.log('setDefaultFarm');

            if (
                (await rewardToken.balanceOf(resolver.address)).toBigInt() === 0n &&
                (await rewardToken.balanceOf(farm.address)).toBigInt() === 0n
            ) {
                await (await rewardToken.mint(resolver.address, resolver.reward.toString())).wait();

                await (
                    await rewardToken.connect(wallet).approve(farm.address, resolver.reward.toString(), {
                        maxFeePerGas: setup.maxFeePerGas,
                        maxPriorityFeePerGas: setup.maxPriorityFeePerGas,
                        gasLimit: '300000',
                    })
                ).wait();
            }
            console.log('approve');
            feeData = await provider.getFeeData();

            const shareToken = await ShareToken.attach(shareTokenAddress);
            if (!(await shareToken.hasPod(resolver.address, farm.address))) {
                await (
                    await shareToken
                        .connect(wallet)
                        .addPod(farm.address, {
                            maxFeePerGas: setup.maxFeePerGas,
                            maxPriorityFeePerGas: setup.maxPriorityFeePerGas,
                            gasLimit: '300000',
                        })
                ).wait();
            }
            console.log('addPod');

            const currentTimestamp = (await provider.getBlock(await provider.getBlockNumber())).timestamp;

            if ((await farm.getFarmInfo()).finished < currentTimestamp) {
                await (
                    await farm
                        .connect(wallet)
                        .startFarming(resolver.reward.toString(), resolver.rewardDuration, {
                            maxFeePerGas: setup.maxFeePerGas,
                            maxPriorityFeePerGas: setup.maxPriorityFeePerGas,
                            gasLimit: '300000',
                        })
                ).wait();
            }
            console.log(`farm for resolvers[${i}] has started`);
        }
    }

    if (setup.deployDelegators) {
        for (let i = 0; i < 7;/* delegators.length */ ++i) {
            const delegator = delegators[i];
            const wallet = new ethers.Wallet(DELEGATORS_PRIVATE_KEYS[i]).connect(provider);
            feeData = await provider.getFeeData();

            console.log(`delegators[${i}] address:`, delegator.address);

            if (
                (await fake1Inch.balanceOf(delegator.address)).toBigInt() === 0n &&
                (await st1inch.depositors(delegator.address)).amount.toBigInt() === 0n
            ) {
                await (await fake1Inch.mint(delegator.address, delegator.stake.toString())).wait();
            }
            console.log('mint');

            if ((await provider.getBalance(delegator.address)).toBigInt() < ether('0.009')) {
                await (
                    await deployerWallet.sendTransaction({
                        to: delegator.address,
                        value: ether('0.1'),
                        maxFeePerGas: setup.maxFeePerGas,
                        maxPriorityFeePerGas: setup.maxPriorityFeePerGas,
                    })
                ).wait();
            }
            console.log('sendTransaction');
            feeData = await provider.getFeeData();

            if ((await st1inch.depositors(delegator.address)).amount.toBigInt() < delegator.stake) {
                const depositAmount = delegator.stake - (await st1inch.depositors(delegator.address)).amount.toBigInt();
                await (
                    await fake1Inch.connect(wallet).approve(st1inch.address, delegator.stake.toString(), {
                        maxFeePerGas: setup.maxFeePerGas,
                        maxPriorityFeePerGas: setup.maxPriorityFeePerGas,
                        gasLimit: '300000',
                    })
                ).wait();
                console.log('approve');

                await (
                    await st1inch.connect(wallet).deposit(depositAmount.toString(), delegator.lockTime, {
                        maxFeePerGas: setup.maxFeePerGas,
                        maxPriorityFeePerGas: setup.maxPriorityFeePerGas,
                        gasLimit: '300000',
                    })
                ).wait();
            }
            console.log('deposit');
            feeData = await provider.getFeeData();

            if (!(await st1inch.hasPod(delegator.address, delegation.address))) {
                await (
                    await st1inch
                        .connect(wallet)
                        .addPod(delegation.address, {
                            maxFeePerGas: setup.maxFeePerGas,
                            maxPriorityFeePerGas: setup.maxPriorityFeePerGas,
                            gasLimit: '300000',
                        })
                ).wait();
            }
            console.log('addPod');

            const resolver = delegator.resolver;
            if ((await delegation.delegated(delegator.address)) !== resolver) {
                await (
                    await delegation
                        .connect(wallet)
                        .delegate(resolver, {
                            maxFeePerGas: setup.maxFeePerGas,
                            maxPriorityFeePerGas: setup.maxPriorityFeePerGas,
                            gasLimit: '300000',
                        })
                ).wait();
            }
            console.log('delegate');

            // // defaultFarm
            // const farmAddress = resolvers.filter(r => r.address === resolver)[0].farm;
            //
            // const shareTokenAddress = await delegation.registration(delegator.resolver);
            // const shareToken = await getContractByAddress('DelegatedShare', shareTokenAddress);
            // if (farmAddress !== undefined && !(await shareToken.hasPod(delegator.address, farmAddress))) {
            //     await (
            //         await shareToken
            //             .connect(wallet)
            //             .addPod(farmAddress, { maxFeePerGas: setup.maxFeePerGas, maxPriorityFeePerGas: setup.maxPriorityFeePerGas, gasLimit: '300000' })
            //     ).wait();
            // }

            if (setup.returnFee) {
                const balance = (await provider.getBalance(delegator.address)).toBigInt();
                if (balance > 0n) {
                    const balance = balance - BigInt(setup.maxPriorityFeePerGas);
                    await (
                        await wallet.sendTransaction({
                            to: process.env.MAINNET_DEPLOYER,
                            value: balance,
                            maxFeePerGas: setup.maxPriorityFeePerGas,
                            maxPriorityFeePerGas: setup.maxPriorityFeePerGas,
                        })
                    ).wait();
                }
            }
            console.log(`delegators[${i}] complite`);
        }
    }
};

module.exports.skip = async () => false;
