const { expect, toBN, constants } = require('@1inch/solidity-utils');
const {
    init,
    create,
    parserObjToOrderSalt,
    encodeParameters,
    onlyStartTime, // eslint-disable-line no-unused-vars
    onlyDuration, // eslint-disable-line no-unused-vars
    onlyInitialRate, // eslint-disable-line no-unused-vars
    onlyFee, // eslint-disable-line no-unused-vars
    onlySalt, // eslint-disable-line no-unused-vars
} = require('./helpers/orderSaltUtils');
const { artifacts } = require('hardhat');

const OrderSaltParserTest = artifacts.require('OrderSaltParserTest');

const ORDERSALT_WITH_SPECIFIC_VALUES = toBN('0x0000000100000002000300000004000000000000000000000000000000000005');
const ORDERSALT_WITH_SIMPLE_VALUES = toBN('0x0000001100000022003300000044000000000000000000000000000000000555');
const ORDERSALT_WITH_FILLED_BOUNDARY_BITS = toBN('0xF0000001F0000002F003F0000004F00000000000000000000000000000000123');
const ORDERSALT_WITH_FILLED_ALL_BITS = toBN(constants.MAX_UINT256);

const compareParserObjects = (saltObj1, saltObj2) => {
    expect(saltObj1.startTime).to.be.bignumber.equals(saltObj2.startTime);
    expect(saltObj1.duration).to.be.bignumber.equals(saltObj2.duration);
    expect(saltObj1.initialRate).to.be.bignumber.equals(saltObj2.initialRate);
    expect(saltObj1.fee).to.be.bignumber.equals(saltObj2.fee);
    expect(saltObj1.salt).to.be.bignumber.equals(saltObj2.salt);
};

describe('OrderSaltParserTest', async () => {
    beforeEach(async () => {
        this.orderSaltParserTest = await OrderSaltParserTest.new();
    });

    describe('init', async () => {
        it('with specific values', async () => {
            compareParserObjects(await this.orderSaltParserTest.init(ORDERSALT_WITH_SPECIFIC_VALUES), {
                startTime: toBN('1'),
                duration: toBN('2'),
                initialRate: toBN('3'),
                fee: toBN('4'),
                salt: toBN('5'),
            });
        });

        it('with simple values', async () => {
            compareParserObjects(await this.orderSaltParserTest.init(ORDERSALT_WITH_SIMPLE_VALUES), init(ORDERSALT_WITH_SIMPLE_VALUES));
        });

        it('with filled bits on the value boundaries', async () => {
            compareParserObjects(await this.orderSaltParserTest.init(ORDERSALT_WITH_FILLED_BOUNDARY_BITS), init(ORDERSALT_WITH_FILLED_BOUNDARY_BITS));
        });

        it('with filled all bits', async () => {
            compareParserObjects(await this.orderSaltParserTest.init(ORDERSALT_WITH_FILLED_ALL_BITS), init(ORDERSALT_WITH_FILLED_ALL_BITS));
        });
    });

    describe('create', async () => {
        it('should create parserObj with specific values', async () => {
            compareParserObjects(await this.orderSaltParserTest.create(toBN('1'), toBN('2'), toBN('3'), toBN('4'), toBN('5')), {
                startTime: toBN('1'),
                duration: toBN('2'),
                initialRate: toBN('3'),
                fee: toBN('4'),
                salt: toBN('5'),
            });
            compareParserObjects(
                await this.orderSaltParserTest.create(toBN('1'), toBN('2'), toBN('3'), toBN('4'), toBN('5')),
                create(toBN('1'), toBN('2'), toBN('3'), toBN('4'), toBN('5')),
            );
        });
    });

    describe('orderSalt', async () => {
        it('with specific values', async () => {
            const parserObj = await this.orderSaltParserTest.init(ORDERSALT_WITH_SPECIFIC_VALUES);
            expect(await this.orderSaltParserTest.orderSalt(parserObj)).to.be.bignumber.equals(parserObjToOrderSalt(parserObj));
        });

        it('with simple values', async () => {
            const parserObj = await this.orderSaltParserTest.init(ORDERSALT_WITH_SIMPLE_VALUES);
            expect(await this.orderSaltParserTest.orderSalt(parserObj)).to.be.bignumber.equals(parserObjToOrderSalt(parserObj));
        });

        it('with filled bits on the value boundaries', async () => {
            const parserObj = await this.orderSaltParserTest.init(ORDERSALT_WITH_FILLED_BOUNDARY_BITS);
            expect(await this.orderSaltParserTest.orderSalt(parserObj)).to.be.bignumber.equals(parserObjToOrderSalt(parserObj));
        });

        it('with filled all bits', async () => {
            const parserObj = await this.orderSaltParserTest.init(ORDERSALT_WITH_FILLED_ALL_BITS);
            expect(await this.orderSaltParserTest.orderSalt(parserObj)).to.be.bignumber.equals(parserObjToOrderSalt(parserObj));
        });
    });

    describe('separate fields', async () => {
        for (const method of ['onlyStartTime', 'onlyDuration', 'onlyInitialRate', 'onlyFee', 'onlySalt']) {
            describe(method, async () => {
                it('with specific values', async () => {
                    expect(await this.orderSaltParserTest[method](ORDERSALT_WITH_SPECIFIC_VALUES))
                        .to.be.bignumber.equals(eval(method + '(ORDERSALT_WITH_SPECIFIC_VALUES)')); // eslint-disable-line no-eval
                });

                it('with simple values', async () => {
                    expect(await this.orderSaltParserTest[method](ORDERSALT_WITH_SIMPLE_VALUES))
                        .to.be.bignumber.equals(eval(method + '(ORDERSALT_WITH_SIMPLE_VALUES)')); // eslint-disable-line no-eval
                });

                it('with filled bits on the value boundaries', async () => {
                    expect(await this.orderSaltParserTest[method](ORDERSALT_WITH_FILLED_BOUNDARY_BITS))
                        .to.be.bignumber.equals(eval(method + '(ORDERSALT_WITH_FILLED_BOUNDARY_BITS)')); // eslint-disable-line no-eval
                });

                it('with filled all bits', async () => {
                    expect(await this.orderSaltParserTest[method](ORDERSALT_WITH_FILLED_ALL_BITS))
                        .to.be.bignumber.equals(eval(method + '(ORDERSALT_WITH_FILLED_ALL_BITS)')); // eslint-disable-line no-eval
                });
            });
        }
    });

    describe('encodeParameters', async () => {
        it('with specific values', async () => {
            const parseObj = init(ORDERSALT_WITH_SPECIFIC_VALUES);
            expect(toBN(encodeParameters(parseObj.startTime, parseObj.duration, parseObj.initialRate, parseObj.fee, parseObj.salt)))
                .to.be.bignumber.equals(ORDERSALT_WITH_SPECIFIC_VALUES);
        });

        it('with simple values', async () => {
            const parseObj = init(ORDERSALT_WITH_SIMPLE_VALUES);
            expect(toBN(encodeParameters(parseObj.startTime, parseObj.duration, parseObj.initialRate, parseObj.fee, parseObj.salt)))
                .to.be.bignumber.equals(ORDERSALT_WITH_SIMPLE_VALUES);
        });

        it('with filled bits on the value boundaries', async () => {
            const parseObj = init(ORDERSALT_WITH_FILLED_BOUNDARY_BITS);
            expect(toBN(encodeParameters(parseObj.startTime, parseObj.duration, parseObj.initialRate, parseObj.fee, parseObj.salt)))
                .to.be.bignumber.equals(ORDERSALT_WITH_FILLED_BOUNDARY_BITS);
        });

        it('with filled all bits', async () => {
            const parseObj = init(ORDERSALT_WITH_FILLED_ALL_BITS);
            expect(toBN(encodeParameters(parseObj.startTime, parseObj.duration, parseObj.initialRate, parseObj.fee, parseObj.salt)))
                .to.be.bignumber.equals(ORDERSALT_WITH_FILLED_ALL_BITS);
        });
    });
});
