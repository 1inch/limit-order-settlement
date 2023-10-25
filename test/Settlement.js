const { time, expect, ether, trim0x, timeIncreaseTo, getPermit, getPermit2, compressPermit, permit2Contract, deployContract } = require('@1inch/solidity-utils');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { ethers } = require('hardhat');
const { deploySwapTokens, getChainId } = require('./helpers/fixtures');
const { buildOrder, signOrder, buildTakerTraits, buildMakerTraits } = require('@1inch/limit-order-protocol-contract/test/helpers/orderUtils');

const ORDER_FEE = 100n;
const BACK_ORDER_FEE = 125n;
const BASE_POINTS = ether('0.001'); // 1e15

describe('Settlement', function () {
    async function initContracts() {
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

    async function buildCalldataForOrder({
        orderData,
        orderSigner,
        minReturn,
        dataFormFixture,
        additionalDataForSettlement = '',
        isInnermostOrder = false,
        isMakingAmount = true,
        fillingAmount = isMakingAmount ? orderData.makingAmount : orderData.takingAmount,
        feeType = 0,
        integrator = orderSigner.address,
        resolverFee = 0,
        auctionDetails = dataFormFixture.others.auctionDetails,
    }) {
        const {
            contracts: { lopv4, settlement, resolver },
            others: { chainId, auctionStartTime },
        } = dataFormFixture;

        let postInteractionFeeDataTypes = ['uint8'];
        let postInteractionFeeData = [0];
        if (feeType === 1) {
            postInteractionFeeDataTypes = [...postInteractionFeeDataTypes, 'bytes4'];
            postInteractionFeeData = [feeType, '0x' + resolverFee.toString(16).padStart(8, '0')];
        }
        if (feeType === 2) {
            postInteractionFeeDataTypes = [...postInteractionFeeDataTypes, 'bytes20', 'bytes4'];
            postInteractionFeeData = [feeType, integrator, '0x' + resolverFee.toString(16).padStart(8, '0')];
        }

        const order = buildOrder(orderData, {
            makingAmountData: settlement.address + trim0x(auctionDetails),
            takingAmountData: settlement.address + trim0x(auctionDetails),
            postInteraction: settlement.address +
                trim0x(ethers.utils.solidityPack(postInteractionFeeDataTypes, postInteractionFeeData)) +
                trim0x(ethers.utils.solidityPack(['uint32', 'bytes10', 'uint16'], [auctionStartTime, '0x' + resolver.address.substring(22), 0])),
        });

        const { r, _vs: vs } = ethers.utils.splitSignature(await signOrder(order, chainId, lopv4.address, orderSigner));

        await resolver.approve(order.takerAsset, lopv4.address);

        const takerTraits = buildTakerTraits({
            makingAmount: isMakingAmount,
            minReturn,
            extension: order.extension,
            interaction: resolver.address + (isInnermostOrder ? '01' : '00') + trim0x(additionalDataForSettlement),
            target: resolver.address,
        });

        return lopv4.interface.encodeFunctionData('fillOrderArgs', [
            order,
            r,
            vs,
            fillingAmount,
            takerTraits.traits,
            takerTraits.args,
        ]);
    }

    it('opposite direction recursive swap', async function () {
        const dataFormFixture = await loadFixture(initContracts);
        const {
            contracts: { dai, weth, resolver },
            accounts: { owner, alice },
        } = dataFormFixture;

        const fillOrderToData1 = await buildCalldataForOrder({
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
            minReturn: ether('100'),
            isInnermostOrder: true,
            isMakingAmount: false,
        });

        const fillOrderToData0 = await buildCalldataForOrder({
            orderData: {
                maker: owner.address,
                makerAsset: weth.address,
                takerAsset: dai.address,
                makingAmount: ether('0.11'),
                takingAmount: ether('100'),
                makerTraits: buildMakerTraits(),
            },
            orderSigner: owner,
            dataFormFixture,
            minReturn: ether('0.11'),
            additionalDataForSettlement: fillOrderToData1,
            isMakingAmount: false,
        });

        const txn = await resolver.settleOrders(fillOrderToData0);
        await expect(txn).to.changeTokenBalances(dai, [owner, alice, resolver], [ether('100'), ether('-100'), ether('0')]);
        await expect(txn).to.changeTokenBalances(weth, [owner, alice, resolver], [ether('-0.11'), ether('0.1'), ether('0.01')]);
    });

    it('settle orders with permits, permit', async function () {
        const dataFormFixture = await loadFixture(initContracts);
        const {
            contracts: { dai, weth, lopv4, resolver },
            accounts: { owner, alice },
            others: { chainId },
        } = dataFormFixture;

        const fillOrderToData1 = await buildCalldataForOrder({
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
            minReturn: ether('100'),
            isInnermostOrder: true,
            isMakingAmount: false,
        });

        const fillOrderToData0 = await buildCalldataForOrder({
            orderData: {
                maker: owner.address,
                makerAsset: weth.address,
                takerAsset: dai.address,
                makingAmount: ether('0.11'),
                takingAmount: ether('100'),
                makerTraits: buildMakerTraits(),
            },
            orderSigner: owner,
            dataFormFixture,
            minReturn: ether('0.11'),
            additionalDataForSettlement: fillOrderToData1,
            isMakingAmount: false,
        });

        await weth.connect(alice).approve(lopv4.address, ether('0.11'));
        await dai.connect(owner).approve(lopv4.address, 0n); // remove direct approve
        const permit0 = compressPermit(await getPermit(owner, dai, '1', chainId, lopv4.address, ether('100')));
        const packing = (1n << 248n) | 1n;
        const txn = await resolver.settleOrdersWithPermits(fillOrderToData0, packing,
            owner.address + trim0x(dai.address) + trim0x(permit0));
        await expect(txn).to.changeTokenBalances(dai, [owner, alice, resolver], [ether('100'), ether('-100'), ether('0')]);
        await expect(txn).to.changeTokenBalances(weth, [owner, alice, resolver], [ether('-0.11'), ether('0.1'), ether('0.01')]);
    });

    it('settle orders with permits, permit2', async function () {
        const dataFormFixture = await loadFixture(initContracts);
        const {
            contracts: { dai, weth, lopv4, resolver },
            accounts: { owner, alice },
            others: { chainId },
        } = dataFormFixture;

        const fillOrderToData1 = await buildCalldataForOrder({
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
            minReturn: ether('100'),
            isInnermostOrder: true,
            isMakingAmount: false,
        });

        const fillOrderToData0 = await buildCalldataForOrder({
            orderData: {
                maker: owner.address,
                makerAsset: weth.address,
                takerAsset: dai.address,
                makingAmount: ether('0.11'),
                takingAmount: ether('100'),
                makerTraits: buildMakerTraits(),
            },
            orderSigner: owner,
            dataFormFixture,
            minReturn: ether('0.11'),
            additionalDataForSettlement: fillOrderToData1,
            isMakingAmount: false,
        });

        const permit2 = await permit2Contract();
        await dai.approve(permit2.address, ether('100'));
        await weth.connect(alice).approve(permit2.address, ether('0.11'));
        await dai.connect(owner).approve(lopv4.address, 0n); // remove direct approve
        await weth.connect(alice).approve(lopv4.address, 0n); // remove direct approve
        const permit0 = compressPermit(await getPermit2(owner, dai.address, chainId, lopv4.address, ether('100')));
        const permit1 = compressPermit(await getPermit2(alice, weth.address, chainId, lopv4.address, ether('0.11')));
        const packing = (2n << 248n) | 2n | 8n;
        const txn = await resolver.settleOrdersWithPermits(fillOrderToData0, packing,
            owner.address + trim0x(dai.address) + trim0x(permit0) + trim0x(alice.address) + trim0x(weth.address) + trim0x(permit1));
        await expect(txn).to.changeTokenBalances(dai, [owner, alice, resolver], [ether('100'), ether('-100'), ether('0')]);
        await expect(txn).to.changeTokenBalances(weth, [owner, alice, resolver], [ether('-0.11'), ether('0.1'), ether('0.01')]);
    });

    it('opposite direction recursive swap with taking fee', async function () {
        const dataFormFixture = await loadFixture(initContracts);
        const {
            contracts: { dai, weth, settlement, resolver },
            accounts: { owner, alice, bob },
        } = dataFormFixture;

        const fillOrderToData1 = await buildCalldataForOrder({
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
            minReturn: ether('100'),
            isInnermostOrder: true,
            isMakingAmount: false,
            feeType: 2,
            integrator: bob.address,
            resolverFee: 1000000,
        });

        const fillOrderToData0 = await buildCalldataForOrder({
            orderData: {
                maker: owner.address,
                makerAsset: weth.address,
                takerAsset: dai.address,
                makingAmount: ether('0.11'),
                takingAmount: ether('100'),
                makerTraits: buildMakerTraits(),
            },
            orderSigner: owner,
            dataFormFixture,
            minReturn: ether('0.11'),
            additionalDataForSettlement: fillOrderToData1,
            isMakingAmount: false,
            feeType: 2,
            integrator: bob.address,
            resolverFee: 1000000,
        });

        const wethFeeAmount = ether('0.0001');
        const daiFeeAmount = ether('0.1');
        // send fee amounts to resolver contract
        await weth.transfer(resolver.address, wethFeeAmount.toString());
        await dai.connect(alice).transfer(resolver.address, daiFeeAmount.toString());
        // approve fee amounts to be spent by SettlementExtension
        await resolver.approve(weth.address, settlement.address);
        await resolver.approve(dai.address, settlement.address);

        const txn = await resolver.settleOrders(fillOrderToData0);
        await expect(txn).to.changeTokenBalances(dai, [owner, alice, bob], [ether('100'), ether('-100'), ether('0.1')]);
        await expect(txn).to.changeTokenBalances(weth, [owner, alice, bob], [ether('-0.11'), ether('0.1'), ether('0.0001')]);
    });

    it('unidirectional recursive swap', async function () {
        const dataFormFixture = await loadFixture(initContracts);
        const {
            contracts: { dai, weth, resolver },
            accounts: { owner, alice },
            others: { abiCoder },
        } = dataFormFixture;

        const resolverArgs = abiCoder.encode(
            ['address[]', 'bytes[]'],
            [
                [weth.address],
                [
                    weth.interface.encodeFunctionData('transferFrom', [
                        owner.address,
                        resolver.address,
                        ether('0.025'),
                    ]),
                ],
            ],
        );

        const fillOrderToData1 = await buildCalldataForOrder({
            orderData: {
                maker: alice.address,
                makerAsset: dai.address,
                takerAsset: weth.address,
                makingAmount: ether('15'),
                takingAmount: ether('0.015'),
                makerTraits: buildMakerTraits(),
            },
            orderSigner: alice,
            dataFormFixture,
            minReturn: ether('15'),
            additionalDataForSettlement: resolverArgs,
            isInnermostOrder: true,
            isMakingAmount: false,
        });

        const fillOrderToData0 = await buildCalldataForOrder({
            orderData: {
                maker: alice.address,
                makerAsset: dai.address,
                takerAsset: weth.address,
                makingAmount: ether('10'),
                takingAmount: ether('0.01'),
                makerTraits: buildMakerTraits(),
            },
            orderSigner: alice,
            dataFormFixture,
            minReturn: ether('10'),
            additionalDataForSettlement: fillOrderToData1,
            isMakingAmount: false,
        });

        await weth.approve(resolver.address, ether('0.025'));

        const txn = await resolver.settleOrders(fillOrderToData0);
        await expect(txn).to.changeTokenBalances(dai, [resolver, alice], [ether('25'), ether('-25')]);
        await expect(txn).to.changeTokenBalances(weth, [owner, alice], [ether('-0.025'), ether('0.025')]);
    });

    it('triple recursive swap', async function () {
        const dataFormFixture = await loadFixture(initContracts);
        const {
            contracts: { dai, weth, resolver },
            accounts: { owner, alice },
        } = dataFormFixture;

        const fillOrderToData2 = await buildCalldataForOrder({
            orderData: {
                maker: owner.address,
                makerAsset: weth.address,
                takerAsset: dai.address,
                makingAmount: ether('0.025'),
                takingAmount: ether('25'),
                makerTraits: buildMakerTraits(),
            },
            orderSigner: owner,
            dataFormFixture,
            minReturn: ether('0.025'),
            isInnermostOrder: true,
            isMakingAmount: false,
        });

        const fillOrderToData1 = await buildCalldataForOrder({
            orderData: {
                maker: alice.address,
                makerAsset: dai.address,
                takerAsset: weth.address,
                makingAmount: ether('15'),
                takingAmount: ether('0.015'),
                makerTraits: buildMakerTraits(),
            },
            orderSigner: alice,
            dataFormFixture,
            minReturn: ether('15'),
            additionalDataForSettlement: fillOrderToData2,
            isMakingAmount: false,
        });

        const fillOrderToData0 = await buildCalldataForOrder({
            orderData: {
                maker: alice.address,
                makerAsset: dai.address,
                takerAsset: weth.address,
                makingAmount: ether('10'),
                takingAmount: ether('0.01'),
                makerTraits: buildMakerTraits(),
            },
            orderSigner: alice,
            dataFormFixture,
            minReturn: ether('10'),
            additionalDataForSettlement: fillOrderToData1,
            isMakingAmount: false,
        });

        const txn = await resolver.settleOrders(fillOrderToData0);
        await expect(txn).to.changeTokenBalances(weth, [owner, alice], [ether('-0.025'), ether('0.025')]);
        await expect(txn).to.changeTokenBalances(dai, [owner, alice], [ether('25'), ether('-25')]);
    });

    describe('dutch auction params', function () {
        const prepareSingleOrder = async ({
            startTime,
            auctionDelay = 0,
            initialRateBump = 1000000n,
            auctionDuration = 1800,
            targetTakingAmount = 0n,
            points = [],
            dataFormFixture,
        }) => {
            const {
                contracts: { dai, weth, resolver },
                accounts: { owner, alice },
                others: { abiCoder },
            } = dataFormFixture;

            let actualTakingAmount = targetTakingAmount;
            if (actualTakingAmount === 0n) {
                actualTakingAmount = ether('0.1');
                const ts = await time.latest();
                // TODO: avoid this shit (as well as any other computations in tests)
                if (ts < startTime + auctionDelay + auctionDuration) {
                    // actualTakingAmount = actualTakingAmount * (
                    //    _BASE_POINTS + initialRateBump * (startTime + auctionDelay + auctionDuration - currentTimestamp) / auctionDuration
                    // ) / _BASE_POINTS
                    const minDuration = startTime + auctionDelay + auctionDuration - ts > auctionDuration ? auctionDuration : startTime + auctionDelay + auctionDuration - ts - 2;
                    actualTakingAmount =
                        (actualTakingAmount * (10000000n + (BigInt(initialRateBump) * BigInt(minDuration)) / BigInt(auctionDuration))) /
                        10000000n;
                }
            }

            const resolverCalldata = abiCoder.encode(
                ['address[]', 'bytes[]'],
                [
                    [weth.address],
                    [
                        weth.interface.encodeFunctionData('transferFrom', [
                            owner.address,
                            resolver.address,
                            actualTakingAmount,
                        ]),
                    ],
                ],
            );

            let auctionDetails = ethers.utils.solidityPack(
                ['uint32', 'uint24', 'uint24'], [startTime + auctionDelay, time.duration.hours(1), initialRateBump],
            );
            for (let i = 0; i < points.length; i++) {
                auctionDetails += trim0x(ethers.utils.solidityPack(['uint24', 'uint16'], [points[i][0], points[i][1]]));
            }

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
                minReturn: ether('100'),
                additionalDataForSettlement: resolverCalldata,
                isInnermostOrder: true,
                isMakingAmount: false,
                fillingAmount: actualTakingAmount,
                auctionDetails,
            });

            await weth.approve(resolver.address, actualTakingAmount);
            return fillOrderToData;
        };

        it('matching order before orderTime has maximal rate bump', async function () {
            const dataFormFixture = await loadFixture(initContracts);
            const {
                contracts: { dai, weth, resolver },
                accounts: { owner, alice },
            } = dataFormFixture;

            const fillOrderToData = await prepareSingleOrder({
                startTime: dataFormFixture.others.auctionStartTime,
                auctionDelay: 60, // seconds
                dataFormFixture,
            });

            const txn = await resolver.settleOrders(fillOrderToData);
            await expect(txn).to.changeTokenBalances(dai, [resolver, alice], [ether('100'), ether('-100')]);
            await expect(txn).to.changeTokenBalances(weth, [owner, alice], [ether('-0.11'), ether('0.11')]);
        });

        describe.skip('order with one bump point', async function () {
            it('matching order before bump point', async function () {
                const dataFormFixture = await loadFixture(initContracts);
                const {
                    contracts: { dai, weth, resolver },
                    accounts: { owner, alice },
                } = dataFormFixture;

                const startTime = await time.latest();
                const actualTakingAmount = ether('0.109');
                const fillOrderToData = await prepareSingleOrder({
                    startTime,
                    initialRateBump: 10000n,
                    auctionDuration: 1800,
                    points: [[240, 9000]],
                    targetTakingAmount: actualTakingAmount,
                    dataFormFixture,
                });

                await timeIncreaseTo(startTime + 239);

                const txn = await resolver.settleOrders(fillOrderToData);
                await expect(txn).to.changeTokenBalances(dai, [resolver, alice], [ether('100'), ether('-100')]);
                await expect(txn).to.changeTokenBalances(weth, [owner, alice], [ether('-0.109'), ether('0.109')]);
            });

            it('matching order after bump point', async function () {
                const dataFormFixture = await loadFixture(initContracts);
                const {
                    contracts: { dai, weth, resolver },
                    accounts: { owner, alice },
                } = dataFormFixture;

                const startTime = await time.latest();
                const actualTakingAmount = ether('0.106');
                const fillOrderToData = await prepareSingleOrder({
                    startTime,
                    initialRateBump: 1000000n,
                    auctionDuration: 1800,
                    points: [[240, 900000n]],
                    targetTakingAmount: actualTakingAmount,
                    dataFormFixture,
                });
                await timeIncreaseTo(startTime + 759);

                const txn = await resolver.settleOrders(fillOrderToData);
                await expect(txn).to.changeTokenBalances(dai, [resolver, alice], [ether('100'), ether('-100')]);
                await expect(txn).to.changeTokenBalances(weth, [owner, alice], [ether('-0.106'), ether('0.106')]);
            });
        });

        it('set initial rate', async function () {
            const dataFormFixture = await loadFixture(initContracts);
            const {
                contracts: { dai, weth, resolver },
                accounts: { owner, alice },
            } = dataFormFixture;

            const fillOrderToData = await prepareSingleOrder({
                startTime: await time.latest(),
                auctionDelay: 60,
                initialRateBump: 2000000n,
                dataFormFixture,
            });

            const txn = await resolver.settleOrders(fillOrderToData);
            await expect(txn).to.changeTokenBalances(dai, [resolver, alice], [ether('100'), ether('-100')]);
            await expect(txn).to.changeTokenBalances(weth, [owner, alice], [ether('-0.12'), ether('0.12')]);
        });

        it.skip('set auctionDuration', async function () {
            const dataFormFixture = await loadFixture(initContracts);
            const {
                contracts: { dai, weth, resolver },
                accounts: { owner, alice },
            } = dataFormFixture;

            const normalizeTime = Math.floor(((await time.latest()) + 59) / 60) * 60;
            await time.increaseTo(normalizeTime);
            const fillOrderToData = await prepareSingleOrder({
                startTime: normalizeTime - 448,
                initialRateBump: 1000000n,
                auctionDuration: 900,
                dataFormFixture,
            });

            const txn = await resolver.settleOrders(fillOrderToData);
            await expect(txn).to.changeTokenBalances(dai, [resolver, alice], [ether('100'), ether('-100')]);
            await expect(txn).to.changeTokenBalances(weth, [owner, alice], [ether('-0.105'), ether('0.105')]);
        });
    });

    it('should change availableCredit with non-zero fee', async function () {
        const dataFormFixture = await loadFixture(initContracts);
        const {
            contracts: { dai, weth, settlement, resolver },
            accounts: { owner, alice },
        } = dataFormFixture;

        const fillOrderToData1 = await buildCalldataForOrder({
            orderData: {
                maker: alice.address,
                makerAsset: weth.address,
                takerAsset: dai.address,
                makingAmount: ether('0.1'),
                takingAmount: ether('100'),
                makerTraits: buildMakerTraits(),
            },
            orderSigner: alice,
            dataFormFixture,
            minReturn: ether('0.1'),
            isInnermostOrder: true,
            isMakingAmount: false,
            feeType: 1,
            resolverFee: BACK_ORDER_FEE,
        });

        const fillOrderToData0 = await buildCalldataForOrder({
            orderData: {
                maker: owner.address,
                makerAsset: dai.address,
                takerAsset: weth.address,
                makingAmount: ether('100'),
                takingAmount: ether('0.1'),
                makerTraits: buildMakerTraits(),
            },
            orderSigner: owner,
            dataFormFixture,
            minReturn: ether('100'),
            additionalDataForSettlement: fillOrderToData1,
            isMakingAmount: false,
            feeType: 1,
            resolverFee: ORDER_FEE,
        });
        const availableCreditBefore = await settlement.availableCredit(resolver.address);

        await resolver.settleOrders(fillOrderToData0);
        expect(await settlement.availableCredit(resolver.address)).to.equal(
            availableCreditBefore.toBigInt() - BASE_POINTS * (ORDER_FEE + BACK_ORDER_FEE),
        );
    });

    it('partial fill with taking fee', async function () {
        const dataFormFixture = await loadFixture(initContracts);
        const {
            contracts: { dai, weth, settlement, resolver },
            accounts: { owner, alice },
            others: { abiCoder },
        } = dataFormFixture;

        const partialModifier = 40n;
        const points = 100n;

        const resolverArgs = abiCoder.encode(
            ['address[]', 'bytes[]'],
            [
                [weth.address],
                [
                    weth.interface.encodeFunctionData('transferFrom', [
                        owner.address,
                        resolver.address,
                        ether('0.01') * partialModifier / points,
                    ]),
                ],
            ],
        );

        const fillOrderToData0 = await buildCalldataForOrder({
            orderData: {
                maker: alice.address,
                makerAsset: dai.address,
                takerAsset: weth.address,
                makingAmount: ether('10'),
                takingAmount: ether('0.01'),
                makerTraits: buildMakerTraits(),
            },
            orderSigner: alice,
            dataFormFixture,
            minReturn: ether('0.01') * partialModifier / points,
            additionalDataForSettlement: resolverArgs,
            isInnermostOrder: true,
            fillingAmount: ether('10') * partialModifier / points,
            feeType: 1,
            resolverFee: ORDER_FEE,
        });

        await weth.approve(resolver.address, ether('0.01'));
        const availableCreditBefore = await settlement.availableCredit(resolver.address);

        const txn = await resolver.settleOrders(fillOrderToData0);
        await expect(txn).to.changeTokenBalances(dai, [resolver, alice], [ether('10') * partialModifier / points, ether('-10') * partialModifier / points]);
        await expect(txn).to.changeTokenBalances(weth, [owner, alice], [ether('-0.01') * partialModifier / points, ether('0.01') * partialModifier / points]);
        expect(await settlement.availableCredit(resolver.address)).to.equal(
            availableCreditBefore.toBigInt() - (ORDER_FEE * partialModifier / points) * BASE_POINTS,
        );
    });

    it('resolver should pay minimal 1 wei fee', async function () {
        const dataFormFixture = await loadFixture(initContracts);
        const {
            contracts: { dai, weth, settlement, resolver },
            accounts: { owner, alice },
            others: { abiCoder },
        } = dataFormFixture;

        const minimalPartialModifier = 1n;
        const points = ether('0.01');
        const minimalOrderFee = 10n;

        const resolverArgs = abiCoder.encode(
            ['address[]', 'bytes[]'],
            [
                [weth.address],
                [
                    weth.interface.encodeFunctionData('transferFrom', [
                        owner.address,
                        resolver.address,
                        ether('0.01') * minimalPartialModifier / points,
                    ]),
                ],
            ],
        );

        const fillOrderToData0 = await buildCalldataForOrder({
            orderData: {
                maker: alice.address,
                makerAsset: dai.address,
                takerAsset: weth.address,
                makingAmount: ether('10'),
                takingAmount: ether('0.01'),
                makerTraits: buildMakerTraits(),
            },
            orderSigner: alice,
            dataFormFixture,
            minReturn: ether('0.01'),
            additionalDataForSettlement: resolverArgs,
            isInnermostOrder: true,
            fillingAmount: ether('10') * minimalPartialModifier / points,
            feeType: 1,
            resolverFee: minimalOrderFee,
        });

        await weth.approve(resolver.address, ether('0.01'));
        const availableCreditBefore = await settlement.availableCredit(resolver.address);

        const txn = await resolver.settleOrders(fillOrderToData0);
        await expect(txn).to.changeTokenBalances(dai, [resolver, alice], [ether('10') * minimalPartialModifier / points, ether('-10') * minimalPartialModifier / points]);
        await expect(txn).to.changeTokenBalances(weth, [owner, alice], [ether('-0.01') * minimalPartialModifier / points, ether('0.01') * minimalPartialModifier / points]);
        expect(await settlement.availableCredit(resolver.address)).to.equal(
            availableCreditBefore.toBigInt() - 1n,
        );
    });

    it('should not change when availableCredit is not enough', async function () {
        const dataFormFixture = await loadFixture(initContracts);
        const {
            contracts: { dai, weth, resolver },
            accounts: { owner, alice },
            others: { BACK_ORDER_FEE },
        } = dataFormFixture;

        const fillOrderToData1 = await buildCalldataForOrder({
            orderData: {
                maker: alice.address,
                makerAsset: weth.address,
                takerAsset: dai.address,
                makingAmount: ether('0.1'),
                takingAmount: ether('100'),
                makerTraits: buildMakerTraits(),
            },
            orderSigner: alice,
            dataFormFixture,
            minReturn: ether('100'),
            isInnermostOrder: true,
            feeType: 1,
            resolverFee: BACK_ORDER_FEE,
        });

        const fillOrderToData0 = await buildCalldataForOrder({
            orderData: {
                maker: owner.address,
                makerAsset: dai.address,
                takerAsset: weth.address,
                makingAmount: ether('100'),
                takingAmount: ether('0.1'),
                makerTraits: buildMakerTraits(),
            },
            orderSigner: owner,
            dataFormFixture,
            minReturn: ether('0.1'),
            additionalDataForSettlement: fillOrderToData1,
            feeType: 1,
            resolverFee: '1000000',
        });

        try {
            await resolver.settleOrders(fillOrderToData0);
            expect.fail('should revert');
        } catch (e) {
            expect(e.message).to.include('FailedExternalCall');
            expect(e.message).to.include('0xa7fd3792'); // NotEnoughCredit()
        }
    });

    describe('whitelist lock period', async function () {
        it('should change only after whitelistedCutOff', async function () {
            const dataFormFixture = await loadFixture(initContracts);
            const {
                contracts: { dai, weth, resolver },
                accounts: { owner, alice },
            } = dataFormFixture;

            dataFormFixture.others.auctionStartTime += time.duration.hours('3');
            const fillOrderToData1 = await buildCalldataForOrder({
                orderData: {
                    maker: alice.address,
                    makerAsset: weth.address,
                    takerAsset: dai.address,
                    makingAmount: ether('0.1'),
                    takingAmount: ether('100'),
                    makerTraits: buildMakerTraits(),
                },
                orderSigner: alice,
                dataFormFixture,
                minReturn: ether('100'),
                isInnermostOrder: true,
            });

            const fillOrderToData0 = await buildCalldataForOrder({
                orderData: {
                    maker: owner.address,
                    makerAsset: dai.address,
                    takerAsset: weth.address,
                    makingAmount: ether('100'),
                    takingAmount: ether('0.1'),
                    makerTraits: buildMakerTraits(),
                },
                orderSigner: owner,
                dataFormFixture,
                minReturn: ether('0.1'),
                additionalDataForSettlement: fillOrderToData1,
            });

            try {
                await resolver.settleOrders(fillOrderToData0);
                expect.fail('should revert');
            } catch (e) {
                expect(e.message).to.include('FailedExternalCall');
                expect(e.message).to.include('0xfac829a0'); // ResolverIsNotWhitelisted()
            }

            await timeIncreaseTo(dataFormFixture.others.auctionStartTime + 1);

            await resolver.settleOrders(fillOrderToData0);
        });

        it.skip('should change by non-whitelisted resolver after publicCutOff', async function () {
            const dataFormFixture = await loadFixture(initContracts);
            const {
                contracts: { dai, weth, settlement, resolver },
                accounts: { owner, alice },
            } = dataFormFixture;

            const fillOrderToData1 = await buildCalldataForOrder({
                orderData: {
                    maker: alice.address,
                    makerAsset: weth.address,
                    takerAsset: dai.address,
                    makingAmount: ether('0.1'),
                    takingAmount: ether('100'),
                    makerTraits: buildMakerTraits({ allowedSender: settlement.address }),
                },
                singleFusionData: { publicTimeDelay: 60n, resolverFee: BACK_ORDER_FEE },
                orderSigner: alice,
                dataFormFixture,
                isInnermostOrder: true,
            });

            const fillOrderToData0 = await buildCalldataForOrder({
                orderData: {
                    maker: owner.address,
                    makerAsset: dai.address,
                    takerAsset: weth.address,
                    makingAmount: ether('100'),
                    takingAmount: ether('0.1'),
                    makerTraits: buildMakerTraits({ allowedSender: settlement.address }),
                },
                singleFusionData: { publicTimeDelay: 60n, resolverFee: ORDER_FEE },
                orderSigner: owner,
                dataFormFixture,
                additionalDataForSettlement: fillOrderToData1,
                needAddResolvers: true,
            });

            await expect(resolver.settleOrders(fillOrderToData0)).to.be.revertedWithCustomError(settlement, 'ResolverIsNotWhitelisted');
            await timeIncreaseTo(BigInt(await time.latest()) + 100n);
            await resolver.settleOrders(fillOrderToData0);
        });
    });
});
