const hre = require('hardhat');
const { getChainId } = hre;

const INCH = {
    1: '0x111111111117dC0aa78b770fA6A738034120C302',  // Mainnet
    137: '0x9c2C5fd7b07E95EE044DDeba0E97a665F142394f'  // Matic
};

const ROUTER_V5_ADDR = '0x1111111254EEB25477B68fb85Ed929f73A960582';

module.exports = async ({ getNamedAccounts, deployments }) => {
    const chainId = await getChainId();

    console.log('running deploy script');
    console.log('network id ', chainId);

    const { deploy } = deployments;
    const { deployer } = await getNamedAccounts();

    const WhitelistRegistrySimple = await deploy('WhitelistRegistrySimple', {
        from: deployer,
    });

    console.log('WhitelistRegistry deployed to:', WhitelistRegistrySimple.address);

    if ((await getChainId()) !== '31337') {
        await hre.run('verify:verify', {
            address: WhitelistRegistrySimple.address,
        });
    }

    const constructorArguments = [
        WhitelistRegistrySimple.address,
        ROUTER_V5_ADDR,
        INCH[chainId],
    ];
    const Settlement = await deploy('Settlement', {
        from: deployer,
        args: constructorArguments,
    });

    console.log('Settlement deployed to:', Settlement.address);

    if ((await getChainId()) !== '31337') {
        await hre.run('verify:verify', {
            address: Settlement.address,
            constructorArguments,
        });
    }
};

module.exports.skip = async () => true;
