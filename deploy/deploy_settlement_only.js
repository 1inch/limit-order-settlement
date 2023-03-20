const { getChainId } = require('hardhat');
const { idempotentDeployGetContract } = require('../test/helpers/utils.js');

const INCH = {
    1: '0x111111111117dC0aa78b770fA6A738034120C302', // Mainnet
    56: '0x111111111117dC0aa78b770fA6A738034120C302', // BSC
    137: '0x9c2C5fd7b07E95EE044DDeba0E97a665F142394f', // Matic
    42161: '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8', // Arbitrum (USDC)
    10: '0x7F5c764cBc14f9669B88837ca1490cCa17c31607', // Optimistic (USDC)
    43114: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E', // Avalanche (USDC)
    100: '0xDDAfbb505ad214D7b80b1f830fcCc89B60fb7A83', // xDAI (USDC)
    250: '0x04068DA6C83AFCFA0e13ba15A6696662335D5B75', // FTM (USDC)
    1313161554: '0xB12BFcA5A55806AaF64E99521918A4bf0fC40802', // Aurora (USDC)
    8217: '0x754288077d0ff82af7a5317c7cb8c444d421d103', // Klaytn (USDC)
    31337: '0x111111111117dC0aa78b770fA6A738034120C302', // Hardhat
};

const ROUTER_V5_ADDR = '0x1111111254EEB25477B68fb85Ed929f73A960582';

module.exports = async ({ getNamedAccounts, deployments }) => {
    const chainId = await getChainId();

    console.log('running deploy script');
    console.log('network id ', chainId);

    const { deployer } = await getNamedAccounts();

    const settlement = await idempotentDeployGetContract(
        'Settlement',
        [ROUTER_V5_ADDR, INCH[chainId]],
        deployments,
        deployer,
        'Settlement',
        // true,
    );

    console.log('Settlement deployed to:', settlement.address);

    const settlementStaging = await idempotentDeployGetContract(
        'Settlement',
        [ROUTER_V5_ADDR, INCH[chainId]],
        deployments,
        deployer,
        'SettlementStaging',
        true,
    );

    console.log('Settlement staging to:', settlementStaging.address);
};

module.exports.skip = async () => true;
