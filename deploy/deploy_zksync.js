const hre = require('hardhat');
const { getChainId } = hre;
const { deployAndGetContract } = require('@1inch/solidity-utils');

const WETH = '0x5AEa5775959fBC2557Cc8789bC1bf90A239D9a91';
const ROUTER_V6_ADDR = '0x6fd4383cB451173D5f9304F041C7BCBf27d561fF';
const FEE_TOKEN = '0x4B9eb6c0b6ea15176BBF62841C6B2A8a398cb656'; // DAI

module.exports = async ({ deployments, getNamedAccounts }) => {
    const networkName = hre.network.name;
    console.log(`running ${networkName} deploy script`);
    const chainId = await getChainId();
    console.log('network id ', chainId);
    if (
        networkName in hre.config.networks[networkName] &&
        chainId !== hre.config.networks[networkName].chainId.toString()
    ) {
        console.log(`network chain id: ${hre.config.networks[networkName].chainId}, your chain id ${chainId}`);
        console.log('skipping wrong chain id deployment');
        return;
    }

    const { deployer } = await getNamedAccounts();

    const constructorArgs = [ROUTER_V6_ADDR, FEE_TOKEN, WETH, deployer];
    const contractName = 'SimpleSettlement';

    const settlement = await deployAndGetContract({
        contractName,
        constructorArgs,
        deployments,
        deployer,
    });

    const feeBankAddress = await settlement.FEE_BANK();

    await hre.run('verify:verify', {
        address: feeBankAddress,
        constructorArguments: [await settlement.getAddress(), FEE_TOKEN, deployer],
    });
};

module.exports.skip = async () => true;
