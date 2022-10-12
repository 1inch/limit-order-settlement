const { expect, toBN, constants } = require('@1inch/solidity-utils');
const {
    initSaltObj,
    encodeParameters,
    getStartTime, // eslint-disable-line no-unused-vars
    getDuration, // eslint-disable-line no-unused-vars
    getInitialRateBump, // eslint-disable-line no-unused-vars
    getFee, // eslint-disable-line no-unused-vars
    getSalt, // eslint-disable-line no-unused-vars
} = require('./helpers/orderSaltUtils');
const { artifacts } = require('hardhat');

const OrderSaltParserTest = artifacts.require('OrderSaltParserTest');

const ORDERSALT_WITH_SPECIFIC_VALUES = toBN('0x0000000100000002000300000004000000000000000000000000000000000005');
const ORDERSALT_WITH_SIMPLE_VALUES = toBN('0x0000001100000022003300000044000000000000000000000000000000000555');
const ORDERSALT_WITH_FILLED_BOUNDARY_BITS = toBN('0xF0000001F0000002F003F0000004F00000000000000000000000000000000123');
const ORDERSALT_WITH_FILLED_ALL_BITS = toBN(constants.MAX_UINT256);

describe('OrderSaltParserTest', async () => {
    beforeEach(async () => {
        this.orderSaltParserTest = await OrderSaltParserTest.new();
    });

    describe('separate fields', async () => {
        for (const method of ['getStartTime', 'getDuration', 'getInitialRateBump', 'getFee', 'getSalt']) {
            describe(method, async () => {
                it('with specific values', async () => {
                    expect(
                        await this.orderSaltParserTest[method](ORDERSALT_WITH_SPECIFIC_VALUES),
                    ).to.be.bignumber.equals(eval(method + '(ORDERSALT_WITH_SPECIFIC_VALUES)')); // eslint-disable-line no-eval
                });

                it('with simple values', async () => {
                    expect(await this.orderSaltParserTest[method](ORDERSALT_WITH_SIMPLE_VALUES)).to.be.bignumber.equals(
                        eval(method + '(ORDERSALT_WITH_SIMPLE_VALUES)'), // eslint-disable-line no-eval
                    );
                });

                it('with filled bits on the value boundaries', async () => {
                    expect(
                        await this.orderSaltParserTest[method](ORDERSALT_WITH_FILLED_BOUNDARY_BITS),
                    ).to.be.bignumber.equals(eval(method + '(ORDERSALT_WITH_FILLED_BOUNDARY_BITS)')); // eslint-disable-line no-eval
                });

                it('with filled all bits', async () => {
                    expect(
                        await this.orderSaltParserTest[method](ORDERSALT_WITH_FILLED_ALL_BITS),
                    ).to.be.bignumber.equals(eval(method + '(ORDERSALT_WITH_FILLED_ALL_BITS)')); // eslint-disable-line no-eval
                });
            });
        }
    });

    describe('encodeParameters', async () => {
        it('with specific values', async () => {
            const parseObj = initSaltObj(ORDERSALT_WITH_SPECIFIC_VALUES);
            expect(
                toBN(
                    encodeParameters(
                        parseObj.startTime,
                        parseObj.duration,
                        parseObj.initialRate,
                        parseObj.fee,
                        parseObj.salt,
                    ),
                ),
            ).to.be.bignumber.equals(ORDERSALT_WITH_SPECIFIC_VALUES);
        });

        it('with simple values', async () => {
            const parseObj = initSaltObj(ORDERSALT_WITH_SIMPLE_VALUES);
            expect(
                toBN(
                    encodeParameters(
                        parseObj.startTime,
                        parseObj.duration,
                        parseObj.initialRate,
                        parseObj.fee,
                        parseObj.salt,
                    ),
                ),
            ).to.be.bignumber.equals(ORDERSALT_WITH_SIMPLE_VALUES);
        });

        it('with filled bits on the value boundaries', async () => {
            const parseObj = initSaltObj(ORDERSALT_WITH_FILLED_BOUNDARY_BITS);
            expect(
                toBN(
                    encodeParameters(
                        parseObj.startTime,
                        parseObj.duration,
                        parseObj.initialRate,
                        parseObj.fee,
                        parseObj.salt,
                    ),
                ),
            ).to.be.bignumber.equals(ORDERSALT_WITH_FILLED_BOUNDARY_BITS);
        });

        it('with filled all bits', async () => {
            const parseObj = initSaltObj(ORDERSALT_WITH_FILLED_ALL_BITS);
            expect(
                toBN(
                    encodeParameters(
                        parseObj.startTime,
                        parseObj.duration,
                        parseObj.initialRate,
                        parseObj.fee,
                        parseObj.salt,
                    ),
                ),
            ).to.be.bignumber.equals(ORDERSALT_WITH_FILLED_ALL_BITS);
        });
    });
});
