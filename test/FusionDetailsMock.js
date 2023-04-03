const { ethers } = require('hardhat');
const { BigNumber } = require('ethers');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { expect, constants, time } = require('@1inch/solidity-utils');
const { buildFusions } = require('./helpers/fusionUtils');

describe('FusionDetailsMock', function () {
    async function initContracts() {
        const FusionDetailsMock = await ethers.getContractFactory('FusionDetailsMock');
        const fusionDetailsMock = await FusionDetailsMock.deploy();
        await fusionDetailsMock.deployed();
        return { fusionDetailsMock };
    }

    it('should return default values', async function () {
        const { fusionDetailsMock } = await loadFixture(initContracts);

        const { fusions: [fusionDetails], resolvers } = await buildFusions([{}]);
        const result = await fusionDetailsMock.parse(fusionDetails, constants.ZERO_ADDRESS, resolvers);

        expect(Object.assign({}, result)).to.deep.contain({
            detailsLength: BigNumber.from('19'),
            takingFeeReceiver: constants.ZERO_ADDRESS,
            takingFeeAmount: BigNumber.from('0'),
            bump: BigNumber.from('0'),
            resolverFee: BigNumber.from('0'),
            isValidResolver: false,
        });
    });

    it('should return custom values', async function () {
        const { fusionDetailsMock } = await loadFixture(initContracts);

        const { fusions: [fusionDetails], resolvers } = await buildFusions([{
            resolvers: [fusionDetailsMock.address],
            points: [[10n, 100n], [5n, 50n]],
            startTime: (await time.latest()) + 100,
            auctionDuration: time.duration.hours(2),
            initialRateBump: 200n,
            resolverFee: 10000n,
            publicTimeDelay: time.duration.hours(1),
        }]);

        await time.increase(time.duration.minutes(2));

        const result = await fusionDetailsMock.parse(fusionDetails, fusionDetailsMock.address, resolvers);

        expect(Object.assign({}, result)).to.deep.include({
            detailsLength: BigNumber.from('32'),
            takingFeeReceiver: constants.ZERO_ADDRESS,
            takingFeeAmount: BigNumber.from('0'),
            bump: BigNumber.from('49'),
            resolverFee: BigNumber.from('10000'),
            isValidResolver: true,
        });
    });
});
