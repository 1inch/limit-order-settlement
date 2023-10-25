const { ethers } = require('hardhat');
const { loadFixture, time } = require('@nomicfoundation/hardhat-network-helpers');
const { buildOrder, buildMakerTraits } = require('@1inch/limit-order-protocol-contract/test/helpers/orderUtils');
const { expect, ether, deployContract, constants } = require('@1inch/solidity-utils');
const { deploySwapTokens, getChainId } = require('./helpers/fixtures');
const { buildCalldataForOrder } = require('./helpers/fusionUtils');

describe('WhitelistChecker // TODO: Update this tests', function () {
    async function initContracts() {
        const [owner, alice] = await ethers.getSigners();
        const chainId = await getChainId();
        const { dai, weth, lopv4 } = await deploySwapTokens();

        const whitelistRegistrySimple = await deployContract('WhitelistRegistrySimple', []);
        const settlement = await deployContract('SettlementExtension', [lopv4.address, weth.address]);

        const ResolverMock = await ethers.getContractFactory('ResolverMock');
        const resolver = await ResolverMock.deploy(settlement.address, lopv4.address);

        await dai.mint(owner.address, ether('100'));
        await dai.mint(alice.address, ether('100'));
        await weth.deposit({ value: ether('1') });
        await weth.connect(alice).deposit({ value: ether('1') });

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
            contracts: { dai, weth, lopv4, whitelistRegistrySimple, settlement, resolver },
            accounts: { owner, alice },
            others: { chainId, auctionDetails, auctionStartTime },
        };
    }

    describe('should not work with non-whitelisted address', function () {
        it('whitelist check in postInteraction method', async function () {
            const dataFormFixture = await loadFixture(initContracts);
            const {
                contracts: { dai, weth, resolver },
                accounts: { alice },
            } = dataFormFixture;

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
                dataFormFixture,
                minReturn: ether('0.1'),
                isInnermostOrder: true,
                whitelistData: '0x' + constants.ZERO_ADDRESS.substring(22),
            });

            try {
                await resolver.settleOrders(fillOrderToData);
                expect.fail('should revert');
            } catch (e) {
                expect(e.message).to.include('FailedExternalCall');
                expect(e.message).to.include('0x4b576069'); // ResolverIsNotWhitelisted()
            }
        });

        it('only resolver can use takerInteraction method', async function () {
            const dataFormFixture = await loadFixture(initContracts);
            const {
                contracts: { dai, weth, resolver, settlement, lopv4 },
                accounts: { alice },
            } = dataFormFixture;

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
                dataFormFixture,
                minReturn: ether('0.1'),
                isInnermostOrder: true,
            });

            // Change resolver to fakeResolver in takerInteraction
            const fakeFillOrderToData = fillOrderToData.slice(0, fillOrderToData.length - 86) + fakeResolver.address.substring(2) + fillOrderToData.slice(-46);

            try {
                await resolver.settleOrders(fakeFillOrderToData);
                expect.fail('should revert');
            } catch (e) {
                expect(e.message).to.include('FailedExternalCall');
                expect(e.message).to.include('0x5211a079'); // NotTaker()
            }
        });

        it('only LOP can use takerInteraction method', async function () {
            const dataFormFixture = await loadFixture(initContracts);
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
            const dataFormFixture = await loadFixture(initContracts);
            const {
                contracts: { dai, weth, resolver },
                accounts: { alice },
            } = dataFormFixture;

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
                dataFormFixture,
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
