const { Wallet } = require('zksync-web3');
const { Deployer } = require('@matterlabs/hardhat-zksync-deploy');

const USDC = '0x3355df6D4c9C3035724Fd0e3914dE96A5a83aaf4';
const ROUTER = '0x9f6BFf99CAf1c9cbeDac15fb84Abd4Eb272EA959';

module.exports = async function (hre) {
    console.log('running deploy script');
    console.log('network id ', await hre.getChainId());

    // Initialize the wallet.
    const wallet = new Wallet(process.env.ZKSYNC_PRIVATE_KEY);

    // Create deployer object and load the artifact of the contract we want to deploy.
    const deployer = new Deployer(hre, wallet);

    const Settlement = await deployer.loadArtifact('Settlement');
    const settlement = await deployer.deploy(Settlement, [ROUTER, USDC]);
    console.log(`${Settlement.contractName} was deployed to ${settlement.address}`);
    if (await hre.getChainId() !== '31337') {
        await hre.run('verify:verify', {
            address: settlement.address,
            constructorArguments: [ROUTER, USDC],
        });
    }

    const settlementStaging = await deployer.deploy(Settlement, [ROUTER, USDC]);
    console.log(`${Settlement.contractName}Staging was deployed to ${settlementStaging.address}`);
};

module.exports.skip = async () => true;
