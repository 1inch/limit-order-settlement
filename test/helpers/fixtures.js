const fs = require('fs');
const path = require('path');
const { ethers } = require('hardhat');
const { ether, deployContract, time } = require('@1inch/solidity-utils');

async function getChainId() {
    return (await ethers.provider.getNetwork()).chainId;
}

async function deploySwapTokens() {
    const [account] = await ethers.getSigners();
    const dai = await deployContract('ERC20PermitMock', ['DAI', 'DAI', account.address, ether('1000')]);
    const weth = await deployContract('WrappedTokenMock', ['WETH', 'WETH']);
    const inch = await deployContract('TokenMock', ['1INCH', '1INCH']);
    const lopv4 = await deployContract('LimitOrderProtocol', [weth.address]);

    const LimitOrderProtocolV3 = JSON.parse(fs.readFileSync(path.join(__dirname, '../../artifacts-v1/LimitOrderProtocolV3.json'), 'utf8'));
    const ContractFactory = await ethers.getContractFactory(LimitOrderProtocolV3.abi, LimitOrderProtocolV3.bytecode);
    const lopv3 = await ContractFactory.deploy(weth.address);
    return { dai, weth, inch, lopv3, lopv4 };
}

async function initContractsForSettlement() {
    const abiCoder = ethers.utils.defaultAbiCoder;
    const chainId = await getChainId();
    const [owner, alice, bob] = await ethers.getSigners();

    const { dai, weth, inch, lopv4 } = await deploySwapTokens();

    await dai.transfer(alice.address, ether('101'));
    await inch.mint(owner.address, ether('100'));
    await weth.deposit({ value: ether('1') });
    await weth.connect(alice).deposit({ value: ether('1') });

    const settlement = await deployContract('SettlementExtensionMock', [lopv4.address, inch.address]);

    const FeeBank = await ethers.getContractFactory('FeeBank');
    const feeBank = FeeBank.attach(await settlement.feeBank());

    const ResolverMock = await ethers.getContractFactory('ResolverMock');
    const resolver = await ResolverMock.deploy(settlement.address, lopv4.address);

    await inch.approve(feeBank.address, ether('100'));
    await feeBank.depositFor(resolver.address, ether('100'));

    await dai.approve(lopv4.address, ether('100'));
    await dai.connect(alice).approve(lopv4.address, ether('100'));
    await weth.approve(lopv4.address, ether('1'));
    await weth.connect(alice).approve(lopv4.address, ether('1'));

    await resolver.approve(dai.address, lopv4.address);
    await resolver.approve(weth.address, lopv4.address);

    const auctionStartTime = await time.latest();
    const auctionDetails = ethers.utils.solidityPack(
        ['uint32', 'uint24', 'uint24'], [auctionStartTime, time.duration.hours(1), 0],
    );

    return {
        contracts: { dai, weth, lopv4, settlement, feeBank, resolver },
        accounts: { owner, alice, bob },
        others: { chainId, abiCoder, auctionStartTime, auctionDetails },
    };
}

module.exports = {
    initContractsForSettlement,
    deploySwapTokens,
    getChainId,
};
