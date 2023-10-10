const { ethers } = require('hardhat');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { signOrder, buildOrder, compactSignature, fillWithMakingAmount } = require('@1inch/limit-order-protocol-contract/test/helpers/orderUtils');
const { expect, ether, trim0x, deployContract } = require('@1inch/solidity-utils');
const { deploySwapTokens, getChainId } = require('./helpers/fixtures');
const { buildFusions } = require('./helpers/fusionUtils');

describe.skip('WhitelistChecker // TODO: Update this tests', function () {
    async function initContracts() {
        const [owner, alice] = await ethers.getSigners();
        const chainId = await getChainId();
        const { dai, weth, lopv4 } = await deploySwapTokens();

        await dai.mint(owner.address, ether('100'));
        await dai.mint(alice.address, ether('100'));
        await weth.deposit({ value: ether('1') });
        await weth.connect(alice).deposit({ value: ether('1') });

        await dai.approve(lopv4.address, ether('100'));
        await dai.connect(alice).approve(lopv4.address, ether('100'));
        await weth.approve(lopv4.address, ether('1'));
        await weth.connect(alice).approve(lopv4.address, ether('1'));

        const whitelistRegistrySimple = await deployContract('WhitelistRegistrySimple', []);
        const settlement = await deployContract('SettlementExtension', [lopv4.address, weth.address]);

        const ResolverMock = await ethers.getContractFactory('ResolverMock');
        const resolver = await ResolverMock.deploy(settlement.address, lopv4.address);

        return {
            contracts: { dai, weth, lopv4, whitelistRegistrySimple, settlement, resolver },
            accounts: { owner, alice },
            others: { chainId },
        };
    }

    describe('should not work with non-whitelisted address', function () {
        it('whitelist check in settleOrders method', async function () {
            const { contracts: { dai, weth, lopv4, settlement }, accounts: { owner, alice }, others: { chainId } } = await loadFixture(initContracts);

            const { fusions: [fusionDetails], hashes: [fusionHash], resolvers } = await buildFusions([{}]);

            const order = buildOrder({
                makerAsset: dai.address,
                takerAsset: weth.address,
                makingAmount: ether('10'),
                takingAmount: ether('0.01'),
                maker: alice.address,
            });
            order.salt = fusionHash;

            const { r, vs } = compactSignature(await signOrder(order, chainId, lopv4.address, alice));
            const fillOrderToData = lopv4.interface.encodeFunctionData('fillOrderTo', [
                order,
                r,
                vs,
                ether('10'),
                fillWithMakingAmount('0'),
                owner.address,
                settlement.address + '01' + trim0x(fusionDetails),
            ]) + trim0x(resolvers);

            await expect(settlement.settleOrders(fillOrderToData))
                .to.be.revertedWithCustomError(settlement, 'ResolverIsNotWhitelisted');
        });

        it('onlyThis modifier in takerInteraction method', async function () {
            const { contracts: { dai, weth, lopv4, settlement }, accounts: { owner, alice }, others: { chainId } } = await loadFixture(initContracts);

            const order = buildOrder({
                makerAsset: dai.address,
                takerAsset: weth.address,
                makingAmount: ether('100'),
                takingAmount: ether('0.1'),
                maker: alice.address,
            });

            const { r, vs } = compactSignature(await signOrder(order, chainId, lopv4.address, alice));
            await expect(lopv4.fillOrderTo(order, r, vs, ether('10'), fillWithMakingAmount('0'), owner.address, settlement.address + '01'))
                .to.be.revertedWithCustomError(settlement, 'AccessDenied');
        });

        it('onlyLimitOrderProtocol modifier', async function () {
            const { contracts: { dai, weth, lopv4, settlement }, accounts: { owner, alice } } = await loadFixture(initContracts);

            const order = buildOrder({
                makerAsset: dai.address,
                takerAsset: weth.address,
                makingAmount: ether('100'),
                takingAmount: ether('0.1'),
                maker: alice.address,
            });
            const orderHash = await lopv4.hashOrder(order);

            await expect(settlement.takerInteraction(order, orderHash, owner.address, '1', '1', '0', '0x'))
                .to.be.revertedWithCustomError(settlement, 'AccessDenied');
        });
    });

    describe('should work with whitelisted address', function () {
        async function initContractsAndSetStatus() {
            const data = await initContracts();
            const { contracts: { whitelistRegistrySimple }, accounts: { owner } } = data;
            await whitelistRegistrySimple.setStatus(owner.address, true);
            return data;
        }

        it('whitelist check in settleOrders method', async function () {
            const { contracts: { dai, weth, lopv4, settlement, resolver }, accounts: { owner, alice }, others: { chainId } } = await loadFixture(initContractsAndSetStatus);

            const { fusions: [fusionDetails0, fusionDetails1], hashes: [fusionHash0, fusionHash1], resolvers } = await buildFusions([
                { resolvers: [resolver.address] },
                { resolvers: [resolver.address] },
            ]);

            const order0 = buildOrder({
                makerAsset: dai.address,
                takerAsset: weth.address,
                makingAmount: ether('100'),
                takingAmount: ether('0.1'),
                maker: owner.address,
            });
            order0.salt = fusionHash0;

            const order1 = buildOrder({
                makerAsset: weth.address,
                takerAsset: dai.address,
                makingAmount: ether('0.1'),
                takingAmount: ether('100'),
                maker: alice.address,
            });
            order1.salt = fusionHash1;

            const { r: r1, vs: vs1 } = compactSignature(await signOrder(order1, chainId, lopv4.address, alice));
            const fillOrderToData1 = lopv4.interface.encodeFunctionData('fillOrderTo', [
                order1,
                r1,
                vs1,
                ether('0.1'),
                fillWithMakingAmount('0'),
                resolver.address,
                settlement.address + '01' + trim0x(fusionDetails1),
            ]);

            const { r: r0, vs: vs0 } = compactSignature(await signOrder(order0, chainId, lopv4.address, owner));
            const fillOrderToData0 = lopv4.interface.encodeFunctionData('fillOrderTo', [
                order0,
                r0,
                vs0,
                ether('100'),
                fillWithMakingAmount('0'),
                resolver.address,
                settlement.address + '00' + trim0x(fusionDetails0) + trim0x(fillOrderToData1),
            ]) + trim0x(resolvers);

            const txn = await resolver.settleOrders(fillOrderToData0);
            await expect(txn).to.changeTokenBalances(dai, [owner, alice], [ether('-100'), ether('100')]);
            await expect(txn).to.changeTokenBalances(weth, [owner, alice], [ether('0.1'), ether('-0.1')]);
        });
    });
});
