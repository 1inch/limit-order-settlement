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

    const constructorArguments = [WhitelistRegistrySimple.address, '0x9b934b33fef7a899f502bc191e820ae655797ed3'];
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
