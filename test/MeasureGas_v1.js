const hre = require('hardhat');
const { ethers } = hre;
const { time, ether, trim0x } = require('@1inch/solidity-utils');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { deploySwapTokens, getChainId } = require('./helpers/fixtures');
const { buildOrder, signOrder, buildSalt } = require('./helpers/orderUtils');

describe('MeasureGas', function () {
    const resolversNumber = 10;
    let addrs;
    let chainId;
    const abiCoder = ethers.utils.defaultAbiCoder;

    before(async function () {
        if (hre.__SOLIDITY_COVERAGE_RUNNING) { this.skip(); }
        chainId = await getChainId();
        addrs = await ethers.getSigners();
    });

    async function initContracts() {
        const { dai, weth, inch, swap } = await deploySwapTokens();

        await dai.mint(addrs[0].address, ether('100'));
        await dai.mint(addrs[1].address, ether('100'));
        await inch.mint(addrs[0].address, ether('100'));
        await weth.deposit({ value: ether('1') });
        await weth.connect(addrs[1]).deposit({ value: ether('1') });

        // const settlement = await deployContract('Settlement', [swap.address, inch.address]);
        const SettlementMock = await ethers.getContractFactory('SettlementMock');
        const settlement = await SettlementMock.deploy(swap.address, inch.address);
        await settlement.deployed();

        const resolvers = [];
        const ResolverMock = await ethers.getContractFactory('ResolverMock');
        for (let i = 0; i < resolversNumber-1; i++) {
            // resolvers[i] = await deployContract('ResolverMock', [settlement.address, swap.address]);
            resolvers[i] = await ResolverMock.deploy(settlement.address);
        }
        const FeeBank = await ethers.getContractFactory('FeeBank');
        const feeBank = FeeBank.attach(await settlement.feeBank());
        await inch.approve(feeBank.address, ether('100'));
        await feeBank.depositFor(resolvers[0].address, ether('100'));

        return { dai, weth, swap, settlement, feeBank, resolvers };
    }

    async function initContractsAndApproves() {
        const { dai, weth, swap, settlement, feeBank, resolvers } = await initContracts();
        await dai.approve(swap.address, ether('100'));
        await dai.connect(addrs[1]).approve(swap.address, ether('100'));
        await weth.approve(swap.address, ether('1'));
        await weth.connect(addrs[1]).approve(swap.address, ether('1'));
        return { dai, weth, swap, settlement, feeBank, resolvers };
    }

    it.only('1 fill for 1 order', async function () {
        const { dai, weth, swap, settlement, resolvers } = await loadFixture(initContractsAndApproves);

        const resolverAddresses = resolvers.map(r => r.address);
        const whitelistedCutOffsTmp = resolvers.map(r => 0);

        const makerAsset = dai.address;
        const takerAsset = weth.address;
        const makingAmount = ether('100');
        const takingAmount = ether('0.1');
        const order = await buildOrder(
            {
                salt: buildSalt({
                    orderStartTime: await time.latest(),
                    initialStartRate: 0,
                    duration: time.duration.hours(1),
                }),
                makerAsset,
                takerAsset,
                makingAmount,
                takingAmount,
                from: addrs[1].address,
            },
            {
                whitelistedAddrs: [addrs[0].address, ...resolverAddresses],
                whitelistedCutOffs: [0, ...whitelistedCutOffsTmp],
                publicCutOff: time.duration.minutes(30),
            },
        );
        const signature = await signOrder(order, chainId, swap.address, addrs[1]);

        const actualTakingAmount = ether('0.19');
        const interaction =
            settlement.address +
            '01' +
            trim0x(resolvers[0].address) +
            '0000000000000000000000000000000000000000000000000000000000000000' +
            trim0x(abiCoder.encode(['address[]', 'bytes[]'], [
                [weth.address],
                [
                    weth.interface.encodeFunctionData('transferFrom', [
                        addrs[0].address,
                        resolvers[0].address,
                        actualTakingAmount,
                    ]),
                ],
            ]));
        await weth.approve(resolvers[0].address, actualTakingAmount);

        const tx = await settlement.settleOrders(
            '0x' + swap.interface.encodeFunctionData('fillOrderTo', [
                order,
                signature,
                interaction,
                makingAmount,
                0,
                takingAmount,
                addrs[0].address,
            ]).substring(10),
        );
        console.log(`1 fill for 1 order gasUsed: ${(await tx.wait()).gasUsed}`);
    });

    it('1 fill for 5 orders in a batch', async function () {
        const { dai, weth, swap, settlement, resolvers } = await loadFixture(initContractsAndApproves);

        const resolverAddresses = resolvers.map(r => r.address);
        const whitelistedCutOffsTmp = resolvers.map(r => 0);

        // Build orders and compact signatures
        const orders = [];
        const signatures = [];
        for (let i = 0; i < 4; i++) {
            orders[i] = await buildOrder(
                {
                    makerAsset: dai.address,
                    takerAsset: weth.address,
                    makingAmount: ether((i + 1).toString()),
                    takingAmount: ether(((i + 1) / 100).toString()),
                    salt: buildSalt({ orderStartTime: await time.latest() }),
                    from: addrs[1].address,
                },
                {
                    whitelistedAddrs: [addrs[0].address, ...resolverAddresses],
                    whitelistedCutOffs: [0, ...whitelistedCutOffsTmp],
                },
            );
            signatures[i] = await signOrder(orders[i], chainId, swap.address, addrs[1]);
        }
        orders[4] = await buildOrder(
            {
                makerAsset: weth.address,
                takerAsset: dai.address,
                makingAmount: ether('0.11'), // takingAmount/100 * 1.1
                takingAmount: ether('1'), // (max_i - 1) * max_i / 2
                from: addrs[0].address,
            },
            {
                whitelistedAddrs: [addrs[0].address, ...resolverAddresses],
                whitelistedCutOffs: [0, ...whitelistedCutOffsTmp],
            },
        );
        signatures[4] = await signOrder(orders[4], chainId, swap.address, addrs[0]);

        // Encode data for fillingg orders
        const fillOrdersToData = [];

        fillOrdersToData[5] = settlement.address + '01' + trim0x(resolvers[0].address) + 'ffffffffff000000000000000000000000000000000000000000000000000000';
        fillOrdersToData[4] =
            settlement.address +
            '00' +
            swap.interface
                .encodeFunctionData('fillOrderTo', [
                    orders[4],
                    signatures[4],
                    fillOrdersToData[5],
                    ether('0.11'),
                    0,
                    ether('10'),
                    settlement.address,
                ])
                .substring(10);
        for (let i = 3; i >= 1; i--) {
            fillOrdersToData[i] =
                settlement.address +
                '00' +
                swap.interface
                    .encodeFunctionData('fillOrderTo', [
                        orders[i],
                        signatures[i],
                        fillOrdersToData[i + 1],
                        ether((i + 1).toString()),
                        0,
                        ether(((i + 1) / 100).toString()),
                        settlement.address,
                    ])
                    .substring(10);
        }

        const tx = await settlement.settleOrders(
            '0x' + swap.interface.encodeFunctionData('fillOrderTo', [
                orders[0],
                signatures[0],
                fillOrdersToData[1],
                ether('1'),
                0,
                ether('0.01'),
                settlement.address,
            ]).substring(10),
        );
        console.log(`1 fill for 5 orders in a batch gasUsed: ${(await tx.wait()).gasUsed}`);
    });
});
