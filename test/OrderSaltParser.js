const { expect, constants } = require('@1inch/solidity-utils');
const {
    initSaltObj,
    encodeParameters,
    getStartTime, // eslint-disable-line no-unused-vars
    getDuration, // eslint-disable-line no-unused-vars
    getInitialRateBump, // eslint-disable-line no-unused-vars
    getFee, // eslint-disable-line no-unused-vars
    getSalt, // eslint-disable-line no-unused-vars
} = require('./helpers/orderSaltUtils');
const { ethers } = require('hardhat');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const ORDERSALT_WITH_SPECIFIC_VALUES = BigInt('0x0000000100000002000300000004000000000000000000000000000000000005');
const ORDERSALT_WITH_SIMPLE_VALUES = BigInt('0x0000001100000022003300000044000000000000000000000000000000000555');
const ORDERSALT_WITH_FILLED_BOUNDARY_BITS = BigInt(
    '0xF0000001F0000002F003F0000004F00000000000000000000000000000000123',
);
const ORDERSALT_WITH_FILLED_ALL_BITS = BigInt(constants.MAX_UINT256);

describe('OrderSaltParserMock', function () {
    async function initContracts() {
        const OrderSaltParserMock = await ethers.getContractFactory('OrderSaltParserMock');
        const orderSaltParserMock = await OrderSaltParserMock.deploy();
        await orderSaltParserMock.deployed();
        return { orderSaltParserMock };
    }

    describe('separate fields', function () {
        for (const method of ['getStartTime', 'getDuration', 'getInitialRateBump', 'getFee', 'getSalt']) {
            describe(method, async function () {
                it('with specific values', async function () {
                    const { orderSaltParserMock } = await loadFixture(initContracts);
                    expect(
                        (
                            await orderSaltParserMock.functions[method + '(uint256)'](ORDERSALT_WITH_SPECIFIC_VALUES)
                        ).toString(),
                    ).to.equal(eval(method + '(ORDERSALT_WITH_SPECIFIC_VALUES)').toString()); // eslint-disable-line no-eval
                });

                it('with simple values', async function () {
                    const { orderSaltParserMock } = await loadFixture(initContracts);
                    expect(
                        (
                            await orderSaltParserMock.functions[method + '(uint256)'](ORDERSALT_WITH_SIMPLE_VALUES)
                        ).toString(),
                    ).to.equal(
                        eval(method + '(ORDERSALT_WITH_SIMPLE_VALUES)').toString(), // eslint-disable-line no-eval
                    );
                });

                it('with filled bits on the value boundaries', async function () {
                    const { orderSaltParserMock } = await loadFixture(initContracts);
                    expect(
                        (
                            await orderSaltParserMock.functions[method + '(uint256)'](
                                ORDERSALT_WITH_FILLED_BOUNDARY_BITS,
                            )
                        ).toString(),
                    ).to.equal(eval(method + '(ORDERSALT_WITH_FILLED_BOUNDARY_BITS)').toString()); // eslint-disable-line no-eval
                });

                it('with filled all bits', async function () {
                    const { orderSaltParserMock } = await loadFixture(initContracts);
                    expect(
                        (
                            await orderSaltParserMock.functions[method + '(uint256)'](ORDERSALT_WITH_FILLED_ALL_BITS)
                        ).toString(),
                    ).to.equal(eval(method + '(ORDERSALT_WITH_FILLED_ALL_BITS)').toString()); // eslint-disable-line no-eval
                });
            });
        }
    });

    describe('encodeParameters', function () {
        it('with specific values', async function () {
            const parseObj = initSaltObj(ORDERSALT_WITH_SPECIFIC_VALUES);
            expect(
                encodeParameters(
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
                encodeParameters(
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
                encodeParameters(
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
                encodeParameters(
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
