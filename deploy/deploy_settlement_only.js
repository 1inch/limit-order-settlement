const hre = require('hardhat');
const { getChainId, ethers } = hre;

const FEE_TOKEN = {
    1: '0x111111111117dC0aa78b770fA6A738034120C302', // Mainnet
    56: '0x111111111117dC0aa78b770fA6A738034120C302', // BSC
    137: '0x9c2C5fd7b07E95EE044DDeba0E97a665F142394f', // Matic
    42161: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1', // Arbitrum (DAI)
    10: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1', // Optimistic (DAI)
    43114: '0xd586E7F844cEa2F87f50152665BCbc2C279D8d70', // Avalanche (DAI)
    100: '0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d', // xDAI (wXDAI)
    250: '0x8D11eC38a3EB5E956B052f67Da8Bdc9bef8Abf3E', // FTM (DAI)
    1313161554: '0xe3520349F477A5F6EB06107066048508498A291b', // Aurora (DAI)
    8217: '0x5c74070FDeA071359b86082bd9f9b3dEaafbe32b', // Klaytn (KDAI)
    8453: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', // Base (DAI)
    31337: '0x111111111117dC0aa78b770fA6A738034120C302', // Hardhat
};

const WETH = {
    1: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // Mainnet
    56: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', // BSC
    137: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270', // Matic
    42161: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', // Arbitrum
    10: '0x4200000000000000000000000000000000000006', // Optimistic
    43114: '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7', // Avalanche
    100: '0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d', // xDAI
    250: '0x21be370D5312f44cB42ce377BC9b8a0cEF1A4C83', // FTM
    1313161554: '0xC9BdeEd33CD01541e1eeD10f90519d2C06Fe3feB', // Aurora
    8217: '0xe4f05A66Ec68B54A58B17c22107b02e0232cC817', // Klaytn
    8453: '0x4200000000000000000000000000000000000006', // Base
    31337: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // Hardhat
};

const ROUTER_V6_ADDR = '0x111111125421ca6dc452d289314280a0f8842a65';

const SETTLEMENT_SALT = ethers.keccak256(ethers.toUtf8Bytes('1inch Settlement V2'));

module.exports = async ({ getNamedAccounts, deployments }) => {
    const chainId = await getChainId();

    console.log('running deploy script');
    console.log('network id ', chainId);

    const { deployer } = await getNamedAccounts();

    const create3Deployer = await ethers.getContractAt('ICreate3Deployer', (await deployments.get('Create3Deployer')).address);

    const CONTRACT_NAME = chainId === '1' ? 'Settlement' : 'SimpleSettlement';

    const SettlementFactory = await ethers.getContractFactory(CONTRACT_NAME);

    const deployData = (await SettlementFactory.getDeployTransaction(ROUTER_V6_ADDR, FEE_TOKEN[chainId], WETH[chainId], deployer)).data;

    const txn = create3Deployer.deploy(SETTLEMENT_SALT, deployData, { gasLimit: 6000000 });
    await (await txn).wait();

    const settlement = await ethers.getContractAt('Settlement', await create3Deployer.addressOf(SETTLEMENT_SALT));

    const feeBankAddress = await settlement.FEE_BANK();

    console.log(CONTRACT_NAME, 'deployed to:', await settlement.getAddress());
    console.log('FeeBank deployed to:', feeBankAddress);

    if (chainId !== '31337') {
        await hre.run('verify:verify', {
            address: feeBankAddress,
            constructorArguments: [await settlement.getAddress(), FEE_TOKEN[chainId], deployer],
        });

        await hre.run('verify:verify', {
            address: await settlement.getAddress(),
            constructorArguments: [ROUTER_V6_ADDR, FEE_TOKEN[chainId], WETH[chainId], deployer],
        });
    }
};

module.exports.skip = async () => true;
