const { ethers } = require('hardhat');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { signOrder, buildOrder, compactSignature, fillWithMakingAmount } = require('@1inch/limit-order-protocol-contract/test/helpers/orderUtils');
const { expect, ether, trim0x } = require('@1inch/solidity-utils');
const { deploySwapTokens, getChainId, deploySimpleRegistry } = require('./helpers/fixtures');
const { buildFusions } = require('./helpers/fusionUtils');

describe('WhitelistChecker', function () {
    let addr, addr1;
    let chainId;

    before(async function () {
        [addr, addr1] = await ethers.getSigners();
        chainId = await getChainId();
    });

    async function initContracts() {
        const { dai, weth, swap } = await deploySwapTokens();

        await dai.mint(addr.address, ether('100'));
        await dai.mint(addr1.address, ether('100'));
        await weth.deposit({ value: ether('1') });
        await weth.connect(addr1).deposit({ value: ether('1') });

        await dai.approve(swap.address, ether('100'));
        await dai.connect(addr1).approve(swap.address, ether('100'));
        await weth.approve(swap.address, ether('1'));
        await weth.connect(addr1).approve(swap.address, ether('1'));

        const whitelistRegistrySimple = await deploySimpleRegistry();
        const Settlement = await ethers.getContractFactory('Settlement');
        const settlement = await Settlement.deploy(swap.address, weth.address);
        await settlement.deployed();

        const ResolverMock = await ethers.getContractFactory('ResolverMock');
        const resolver = await ResolverMock.deploy(settlement.address, swap.address);

        return { dai, weth, swap, whitelistRegistrySimple, settlement, resolver };
    }

    describe('should not work with non-whitelisted address', function () {
        it('whitelist check in settleOrders method', async function () {
            const { dai, weth, swap, settlement } = await loadFixture(initContracts);

            const { fusions: [fusionDetails], hashes: [fusionHash], resolvers } = await buildFusions([{}]);

            const order = await buildOrder({
                makerAsset: dai.address,
                takerAsset: weth.address,
                makingAmount: ether('10'),
                takingAmount: ether('0.01'),
                maker: addr1.address,
            });
            order.salt = fusionHash;

            const { r, vs } = compactSignature(await signOrder(order, chainId, swap.address, addr1));
            const fillOrderToData = swap.interface.encodeFunctionData('fillOrderTo', [
                order,
                r,
                vs,
                ether('10'),
                fillWithMakingAmount('0'),
                addr.address,
                settlement.address + '01' + trim0x(fusionDetails),
            ]) + trim0x(resolvers);

            await expect(settlement.settleOrders(fillOrderToData))
                .to.be.revertedWithCustomError(settlement, 'ResolverIsNotWhitelisted');
        });

        it('onlyThis modifier in takerInteraction method', async function () {
            const { dai, weth, swap, settlement } = await loadFixture(initContracts);

            const order = await buildOrder({
                makerAsset: dai.address,
                takerAsset: weth.address,
                makingAmount: ether('100'),
                takingAmount: ether('0.1'),
                maker: addr1.address,
            });

            const { r, vs } = compactSignature(await signOrder(order, chainId, swap.address, addr1));
            await expect(swap.fillOrderTo(order, r, vs, ether('10'), fillWithMakingAmount('0'), addr.address, settlement.address + '01'))
                .to.be.revertedWithCustomError(settlement, 'AccessDenied');
        });

        it('onlyLimitOrderProtocol modifier', async function () {
            const { dai, weth, swap, settlement } = await loadFixture(initContracts);

            const order = await buildOrder({
                makerAsset: dai.address,
                takerAsset: weth.address,
                makingAmount: ether('100'),
                takingAmount: ether('0.1'),
                maker: addr1.address,
            });
            const orderHash = await swap.hashOrder(order);

            await expect(settlement.takerInteraction(order, orderHash, addr.address, '1', '1', '0', '0x'))
                .to.be.revertedWithCustomError(settlement, 'AccessDenied');
        });
    });

    describe('should work with whitelisted address', function () {
        async function initContractsAndSetStatus() {
            const { dai, weth, swap, whitelistRegistrySimple, settlement, resolver } = await initContracts();
            await whitelistRegistrySimple.setStatus(addr.address, true);
            return { dai, weth, swap, settlement, resolver };
        }

        it('whitelist check in settleOrders method', async function () {
            const { dai, weth, swap, settlement, resolver } = await loadFixture(initContractsAndSetStatus);

            const { fusions: [fusionDetails0, fusionDetails1], hashes: [fusionHash0, fusionHash1], resolvers } = await buildFusions([
                { resolvers: [resolver.address], initialRateBump: 0n },
                { resolvers: [resolver.address], initialRateBump: 0n },
            ]);

            const order0 = await buildOrder({
                makerAsset: dai.address,
                takerAsset: weth.address,
                makingAmount: ether('100'),
                takingAmount: ether('0.1'),
                maker: addr.address,
            });
            order0.salt = fusionHash0;

            const order1 = await buildOrder({
                makerAsset: weth.address,
                takerAsset: dai.address,
                makingAmount: ether('0.1'),
                takingAmount: ether('100'),
                maker: addr1.address,
            });
            order1.salt = fusionHash1;

            const { r: r1, vs: vs1 } = compactSignature(await signOrder(order1, chainId, swap.address, addr1));
            const fillOrderToData1 = swap.interface.encodeFunctionData('fillOrderTo', [
                order1,
                r1,
                vs1,
                ether('0.1'),
                fillWithMakingAmount('0'),
                resolver.address,
                settlement.address + '01' + trim0x(fusionDetails1),
            ]);

            const { r: r0, vs: vs0 } = compactSignature(await signOrder(order0, chainId, swap.address, addr));
            const fillOrderToData0 = swap.interface.encodeFunctionData('fillOrderTo', [
                order0,
                r0,
                vs0,
                ether('100'),
                fillWithMakingAmount('0'),
                resolver.address,
                settlement.address + '00' + trim0x(fusionDetails0) + trim0x(fillOrderToData1),
            ]) + trim0x(resolvers);

            const txn = await resolver.settleOrders(fillOrderToData0);
            await expect(txn).to.changeTokenBalances(dai, [addr, addr1], [ether('-100'), ether('100')]);
            await expect(txn).to.changeTokenBalances(weth, [addr, addr1], [ether('0.1'), ether('-0.1')]);
        });
    });
});
