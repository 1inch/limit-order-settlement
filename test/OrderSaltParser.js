const { ethers } = require('hardhat');
const { BigNumber } = require('ethers');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { expect, constants } = require('@1inch/solidity-utils');
const { buildFusion } = require('./helpers/fusionUtils');

describe('FusionDetailsMock', function () {
    async function initContracts() {
        const FusionDetailsMock = await ethers.getContractFactory('FusionDetailsMock');
        const fusionDetailsMock = await FusionDetailsMock.deploy();
        await fusionDetailsMock.deployed();
        return { fusionDetailsMock };
    }

    describe('separate fields', function () {
        it.only('should return correct values', async function () {
            const { fusionDetailsMock } = await loadFixture(initContracts);

            const details = buildFusion();
            const result = await fusionDetailsMock.parse(details, constants.ZERO_ADDRESS);
            const resultObject = Object.fromEntries(
                Object.entries(result)
                    .filter(([k]) => isNaN(parseInt(k)))
                    .map(([k, v]) => [k, BigNumber.isBigNumber(v) ? v.toBigInt() : v]),
            );

            expect(resultObject).to.contain({
                detailsLength: 19n,
                takingFeeReceiver: '0x0000000000000000000000000000000000000000',
                takingFeeAmount: 0n,
                bump: 0n,
                resolverFee: 0n,
                isValidResolver: false,
            });
        });
    });
});
