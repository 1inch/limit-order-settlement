const { expect, constants } = require('@1inch/solidity-utils');
const {
    initSaltObj,
    encodeSalt,
    getStartTime,
    getDuration,
    getInitialRateBump,
    getFee,
    getSalt,
} = require('./helpers/orderSaltUtils');
const { ethers } = require('hardhat');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const ORDERSALT_WITH_SPECIFIC_VALUES      = 0x0000000100000203000000000004000000000000000000000000000000000005n;
const ORDERSALT_WITH_SIMPLE_VALUES        = 0x0000001100002233000000000044000000000000000000000000000000000555n;
const ORDERSALT_WITH_FILLED_BOUNDARY_BITS = 0xF0000001F00002F003F000000004F00000000000000000000000000000000123n;
const ORDERSALT_WITH_FILLED_ALL_BITS      = BigInt(constants.MAX_UINT256);

describe('OrderSaltParserMock', function () {
    async function initContracts() {
        const OrderSaltParserMock = await ethers.getContractFactory('OrderSaltParserMock');
        const orderSaltParserMock = await OrderSaltParserMock.deploy();
        await orderSaltParserMock.deployed();
        return { orderSaltParserMock };
    }

    describe('separate fields', function () {
        for (const [methodName, method] of Object.entries({ getStartTime, getDuration, getInitialRateBump, getFee, getSalt })) {
            describe(`Method ${methodName}`, async function () {
                it('with specific values', async function () {
                    const { orderSaltParserMock } = await loadFixture(initContracts);
                    expect(
                        (
                            await orderSaltParserMock.functions[methodName + '(uint256)'](ORDERSALT_WITH_SPECIFIC_VALUES)
                        ).toString(),
                    ).to.equal(method(ORDERSALT_WITH_SPECIFIC_VALUES).toString());
                });

                it('with simple values', async function () {
                    const { orderSaltParserMock } = await loadFixture(initContracts);
                    expect(
                        (
                            await orderSaltParserMock.functions[methodName + '(uint256)'](ORDERSALT_WITH_SIMPLE_VALUES)
                        ).toString(),
                    ).to.equal(
                        method(ORDERSALT_WITH_SIMPLE_VALUES).toString(),
                    );
                });

                it('with filled bits on the value boundaries', async function () {
                    const { orderSaltParserMock } = await loadFixture(initContracts);
                    expect(
                        (
                            await orderSaltParserMock.functions[methodName + '(uint256)'](
                                ORDERSALT_WITH_FILLED_BOUNDARY_BITS,
                            )
                        ).toString(),
                    ).to.equal(method(ORDERSALT_WITH_FILLED_BOUNDARY_BITS).toString());
                });

                it('with filled all bits', async function () {
                    const { orderSaltParserMock } = await loadFixture(initContracts);
                    expect(
                        (
                            await orderSaltParserMock.functions[methodName + '(uint256)'](ORDERSALT_WITH_FILLED_ALL_BITS)
                        ).toString(),
                    ).to.equal(method(ORDERSALT_WITH_FILLED_ALL_BITS).toString());
                });
            });
        }
    });

    describe('encodeSalt', function () {
        it('with specific values', async function () {
            const parseObj = initSaltObj(ORDERSALT_WITH_SPECIFIC_VALUES);
            expect(
                encodeSalt(
                    parseObj.startTime,
                    parseObj.duration,
                    parseObj.initialRate,
                    parseObj.fee,
                    parseObj.salt,
                ),
            ).to.equal(ORDERSALT_WITH_SPECIFIC_VALUES);
        });

        it('with simple values', async function () {
            const parseObj = initSaltObj(ORDERSALT_WITH_SIMPLE_VALUES);
            expect(
                encodeSalt(
                    parseObj.startTime,
                    parseObj.duration,
                    parseObj.initialRate,
                    parseObj.fee,
                    parseObj.salt,
                ),
            ).to.equal(ORDERSALT_WITH_SIMPLE_VALUES);
        });

        it('with filled bits on the value boundaries', async function () {
            const parseObj = initSaltObj(ORDERSALT_WITH_FILLED_BOUNDARY_BITS);
            expect(
                encodeSalt(
                    parseObj.startTime,
                    parseObj.duration,
                    parseObj.initialRate,
                    parseObj.fee,
                    parseObj.salt,
                ),
            ).to.equal(ORDERSALT_WITH_FILLED_BOUNDARY_BITS);
        });

        it('with filled all bits', async function () {
            const parseObj = initSaltObj(ORDERSALT_WITH_FILLED_ALL_BITS);
            expect(
                encodeSalt(
                    parseObj.startTime,
                    parseObj.duration,
                    parseObj.initialRate,
                    parseObj.fee,
                    parseObj.salt,
                ),
            ).to.equal(ORDERSALT_WITH_FILLED_ALL_BITS);
        });
    });
});
