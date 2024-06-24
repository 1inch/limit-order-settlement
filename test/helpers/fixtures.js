const fs = require('fs');
const path = require('path');
const { ethers } = require('hardhat');
const { ether, deployContract } = require('@1inch/solidity-utils');

async function getChainId() {
    return (await ethers.provider.getNetwork()).chainId;
}

async function deploySwapTokens() {
    const [account] = await ethers.getSigners();
    const dai = await deployContract('ERC20PermitMock', ['DAI', 'DAI', account, ether('1000')]);
    const weth = await deployContract('WrappedTokenMock', ['WETH', 'WETH']);
    const inch = await deployContract('TokenMock', ['1INCH', '1INCH']);
    const accessToken = await deployContract('TokenMock', ['NFT', 'NFT']);
    const lopv4 = await deployContract('LimitOrderProtocol', [weth]);

    const LimitOrderProtocolV3 = JSON.parse(fs.readFileSync(path.join(__dirname, '../../artifacts-v1/LimitOrderProtocolV3.json'), 'utf8'));
    const ContractFactory = await ethers.getContractFactory(LimitOrderProtocolV3.abi, LimitOrderProtocolV3.bytecode);
    const lopv3 = await ContractFactory.deploy(weth);

    return { dai, weth, inch, accessToken, lopv3, lopv4 };
}

async function initContractsForSettlement() {
    const abiCoder = ethers.AbiCoder.defaultAbiCoder();
    const chainId = await getChainId();
    const [owner, alice, bob] = await ethers.getSigners();

    const { dai, weth, inch, accessToken, lopv4 } = await deploySwapTokens();

    await dai.transfer(alice, ether('101'));
    await inch.mint(owner, ether('100'));
    await weth.deposit({ value: ether('1') });
    await weth.connect(alice).deposit({ value: ether('1') });

    const settlement = await deployContract('SettlementMock', [lopv4, inch, accessToken, weth]);

    const FeeBank = await ethers.getContractFactory('FeeBank');
    const feeBank = FeeBank.attach(await settlement.FEE_BANK());

    const ResolverMock = await ethers.getContractFactory('ResolverMock');
    const resolver = await ResolverMock.deploy(settlement, lopv4);

    await inch.approve(feeBank, ether('100'));
    await feeBank.depositFor(resolver, ether('100'));

    await dai.approve(lopv4, ether('100'));
    await dai.connect(alice).approve(lopv4, ether('100'));
    await weth.approve(lopv4, ether('1'));
    await weth.connect(alice).approve(lopv4, ether('1'));

    await resolver.approve(dai, lopv4);
    await resolver.approve(weth, lopv4);

    await accessToken.mint(resolver, 1);
    await accessToken.mint(owner, 1);

    return {
        contracts: { dai, weth, accessToken, lopv4, settlement, feeBank, resolver },
        accounts: { owner, alice, bob },
        others: { chainId, abiCoder },
    };
}

module.exports = {
    initContractsForSettlement,
    deploySwapTokens,
    getChainId,
};
