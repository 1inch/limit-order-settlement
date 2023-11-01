const { ethers } = require('hardhat');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { expect, ether, constants } = require('@1inch/solidity-utils');
const { buildOrder, buildMakerTraits } = require('@1inch/limit-order-protocol-contract/test/helpers/orderUtils');
const { initContractsForSettlement } = require('./helpers/fixtures');
const { buildAuctionDetails, buildCalldataForOrder } = require('./helpers/fusionUtils');

describe('WhitelistChecker', function () {
    describe('should not work with non-whitelisted address', function () {
        it('whitelist check in postInteraction method', async function () {
            const dataFormFixture = await loadFixture(initContractsForSettlement);
            const auction = await buildAuctionDetails();
            const setupData = { ...dataFormFixture, auction };
            const {
                contracts: { dai, weth, resolver },
                accounts: { alice },
            } = setupData;

            weth.transfer(resolver.address, ether('0.1'));

            const fillOrderToData = await buildCalldataForOrder({
                orderData: {
                    maker: alice.address,
                    makerAsset: dai.address,
                    takerAsset: weth.address,
                    makingAmount: ether('100'),
                    takingAmount: ether('0.1'),
                    makerTraits: buildMakerTraits(),
                },
                orderSigner: alice,
                setupData,
                minReturn: ether('0.1'),
                isInnermostOrder: true,
                whitelistData: '0x' + constants.ZERO_ADDRESS.substring(22),
            });

            await expect(resolver.settleOrders(fillOrderToData)).to.be.revertedWithCustomError(
                dataFormFixture.contracts.settlement, 'ResolverIsNotWhitelisted'
            );
        });

        it('only resolver can use takerInteraction method', async function () {
            const dataFormFixture = await loadFixture(initContractsForSettlement);
            const auction = await buildAuctionDetails();
            const setupData = { ...dataFormFixture, auction };
            const {
                contracts: { dai, weth, resolver, settlement, lopv4 },
                accounts: { alice },
            } = setupData;

            // Deploy another resolver
            const ResolverMock = await ethers.getContractFactory('ResolverMock');
            const fakeResolver = await ResolverMock.deploy(settlement.address, lopv4.address);

            const fillOrderToData = await buildCalldataForOrder({
                orderData: {
                    maker: alice.address,
                    makerAsset: dai.address,
                    takerAsset: weth.address,
                    makingAmount: ether('100'),
                    takingAmount: ether('0.1'),
                    makerTraits: buildMakerTraits(),
                },
                orderSigner: alice,
                setupData,
                minReturn: ether('0.1'),
                isInnermostOrder: true,
            });

            // Change resolver to fakeResolver in takerInteraction
            const fakeFillOrderToData = fillOrderToData.slice(0, fillOrderToData.length - 86) + fakeResolver.address.substring(2) + fillOrderToData.slice(-46);

            await expect(resolver.settleOrders(fakeFillOrderToData)).to.be.revertedWithCustomError(
                resolver, 'NotTaker'
            );
        });

        it('only LOP can use takerInteraction method', async function () {
            const dataFormFixture = await loadFixture(initContractsForSettlement);
            const {
                contracts: { dai, weth, resolver, lopv4 },
                accounts: { alice },
            } = dataFormFixture;

            const order = buildOrder({
                maker: alice.address,
                makerAsset: dai.address,
                takerAsset: weth.address,
                makingAmount: ether('100'),
                takingAmount: ether('0.1'),
            });
            const orderHash = await lopv4.hashOrder(order);

            await expect(resolver.takerInteraction(order, '0x', orderHash, alice.address, '0', '0', '0', '0x'))
                .to.be.revertedWithCustomError(resolver, 'OnlyLOP');
        });
    });

    describe('should work with whitelisted address', function () {
        it('whitelist check in settleOrders method', async function () {
            const dataFormFixture = await loadFixture(initContractsForSettlement);
            const auction = await buildAuctionDetails();
            const setupData = { ...dataFormFixture, auction };
            const {
                contracts: { dai, weth, resolver },
                accounts: { alice },
            } = setupData;

            weth.transfer(resolver.address, ether('0.1'));

            const fillOrderToData = await buildCalldataForOrder({
                orderData: {
                    maker: alice.address,
                    makerAsset: dai.address,
                    takerAsset: weth.address,
                    makingAmount: ether('100'),
                    takingAmount: ether('0.1'),
                    makerTraits: buildMakerTraits(),
                },
                orderSigner: alice,
                setupData,
                minReturn: ether('0.1'),
                isInnermostOrder: true,
                whitelistData: '0x' + resolver.address.substring(22),
            });

            const txn = await resolver.settleOrders(fillOrderToData);
            await expect(txn).to.changeTokenBalances(dai, [alice, resolver], [ether('-100'), ether('100')]);
            await expect(txn).to.changeTokenBalances(weth, [alice, resolver], [ether('0.1'), ether('-0.1')]);
        });
    });
});
