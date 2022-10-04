const hre = require('hardhat');
const { getChainId } = hre;

module.exports = async ({ getNamedAccounts, deployments }) => {
    console.log('running deploy script');
    console.log('network id ', await getChainId());

    const { deploy } = deployments;
    const { deployer } = await getNamedAccounts();

    const WhitelistRegistrySimple = await deploy('WhitelistRegistrySimple', {
        from: deployer,
    });

    if ((await getChainId()) !== '31337') {
        await hre.run('verify:verify', {
            address: WhitelistRegistrySimple.address,
        });
    }

    const constructorArguments = ['0x521abad8E91e2126E66B018170184da26aeAbFc4', WhitelistRegistrySimple.address];
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
