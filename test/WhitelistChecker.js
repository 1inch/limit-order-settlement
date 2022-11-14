const { expect, ether, constants } = require('@1inch/solidity-utils');
const { ethers } = require('hardhat');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { deploySwapTokens, getChainId, deploySimpleRegistry } = require('./helpers/fixtures');
const { buildOrder, signOrder } = require('./helpers/orderUtils');

describe('WhitelistChecker', function () {
    let addr, addr1;
    let chainId;
    const abiCoder = ethers.utils.defaultAbiCoder;

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
        const matcher = await Settlement.deploy(whitelistRegistrySimple.address, swap.address, constants.ZERO_ADDRESS);
        await matcher.deployed();
        return { dai, weth, swap, whitelistRegistrySimple, matcher };
    }

    async function settleOrders(settleOrderMethod, dai, weth, swap, matcher) {
        const order0 = await buildOrder({
            makerAsset: dai.address,
            takerAsset: weth.address,
            makingAmount: ether('100'),
            takingAmount: ether('0.1'),
            from: addr.address,
        });
        const order1 = await buildOrder({
            makerAsset: weth.address,
            takerAsset: dai.address,
            makingAmount: ether('0.1'),
            takingAmount: ether('100'),
            from: addr1.address,
        });
        const signature0 = await signOrder(order0, chainId, swap.address, addr);
        const signature1 = await signOrder(order1, chainId, swap.address, addr1);
        const matchingParams =
            matcher.address +
            '01' +
            abiCoder
                .encode(
                    ['address[]', 'bytes[]'],
                    [
                        [weth.address, dai.address],
                        [
                            weth.interface.encodeFunctionData('approve', [swap.address, ether('0.1')]),
                            dai.interface.encodeFunctionData('approve', [swap.address, ether('100')]),
                        ],
                    ],
                )
                .substring(2);
        const interaction =
            matcher.address +
            '00' +
            swap.interface
                .encodeFunctionData('fillOrderTo', [
                    order1,
                    signature1,
                    matchingParams,
                    ether('0.1'),
                    0,
                    ether('100'),
                    matcher.address,
                ])
                .substring(10);
        await settleOrderMethod(
            swap.address,
            order0,
            signature0,
            interaction,
            ether('100'),
            0,
            ether('0.1'),
            matcher.address,
        );
    }

    describe('should not work with non-whitelisted address', function () {
        it('onlyWhitelisted modifier in settleOrders method', async function () {
            const { dai, weth, swap, matcher } = await loadFixture(initContracts);
            const order1 = await buildOrder({
                makerAsset: dai.address,
                takerAsset: weth.address,
                makingAmount: ether('10'),
                takingAmount: ether('0.01'),
                from: addr1.address,
            });
            await expect(
                matcher.settleOrders(swap.address, order1, '0x', '0x', ether('10'), 0, ether('0.01'), matcher.address),
            ).to.be.revertedWithCustomError(matcher, 'AccessDenied');
        });

        it('onlyWhitelisted modifier in fillOrderInteraction method', async function () {
            const { dai, weth, swap, matcher } = await loadFixture(initContracts);
            const order = await buildOrder({
                makerAsset: dai.address,
                takerAsset: weth.address,
                makingAmount: ether('100'),
                takingAmount: ether('0.1'),
                from: addr1.address,
            });
            const signature = signOrder(order, chainId, swap.address, addr1);
            const interaction =
                matcher.address +
                '01' +
                abiCoder.encode(['address[]', 'bytes[]'], [[matcher.address], ['0x']]).substring(2);
            await expect(
                swap.fillOrder(order, signature, interaction, ether('10'), 0, ether('0.01')),
            ).to.be.revertedWithCustomError(swap, 'AccessDenied');
        });

        it('onlyLimitOrderProtocol modifier', async function () {
            const { matcher } = await loadFixture(initContracts);
            await expect(matcher.fillOrderInteraction(addr.address, '0', '0', '0x')).to.be.revertedWithCustomError(
                matcher,
                'AccessDenied',
            );
        });
    });

    describe('should work with whitelisted address', function () {
        async function initContractsAndSetStatus() {
            const { dai, weth, swap, whitelistRegistrySimple, matcher } = await initContracts();
            await whitelistRegistrySimple.setStatus(addr.address, true);
            return { dai, weth, swap, matcher };
        }

        it('onlyWhitelisted modifier in settleOrders method', async function () {
            const { dai, weth, swap, matcher } = await loadFixture(initContractsAndSetStatus);

            const addrweth = await weth.balanceOf(addr.address);
            const addr1weth = await weth.balanceOf(addr1.address);
            const addrdai = await dai.balanceOf(addr.address);
            const addr1dai = await dai.balanceOf(addr1.address);

            await settleOrders(matcher.settleOrders, dai, weth, swap, matcher);

            expect(await weth.balanceOf(addr.address)).to.equal(addrweth.add(ether('0.1')));
            expect(await weth.balanceOf(addr1.address)).to.equal(addr1weth.sub(ether('0.1')));
            expect(await dai.balanceOf(addr.address)).to.equal(addrdai.sub(ether('100')));
            expect(await dai.balanceOf(addr1.address)).to.equal(addr1dai.add(ether('100')));
        });
    });
});
