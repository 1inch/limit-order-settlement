const hre = require('hardhat');
const { getChainId } = hre;

module.exports = async ({ getNamedAccounts, deployments }) => {
    console.log('running deploy script');
    console.log('network id ', await getChainId());

    const { deploy } = deployments;
    const { deployer } = await getNamedAccounts();

    const Settlement = await deploy('Settlement', {
        from: deployer,
    });

    console.log('Settlement deployed to:', Settlement.address);

    if (await getChainId() !== '31337') {
        await hre.run('verify:verify', {
            address: Settlement.address,
        });
    }
};

module.exports.skip = async () => true;
