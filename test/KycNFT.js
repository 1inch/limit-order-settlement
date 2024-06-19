const { expect, deployContract, constants } = require('@1inch/solidity-utils');
const { ethers } = require('hardhat');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

describe('KycNFT', function () {
    async function initContracts() {
        const [owner, alice, bob] = await ethers.getSigners();
        const tokenIds = {
            owner: '0x00',
            alice: '0x01',
            bob: '0x02',
            another: '0x03',
            nonexist: '0xabcdef',
        };
        const nft = await deployContract('KycNFT', ['KycNFT', 'KYC', owner]);
        await nft.mint(owner, tokenIds.owner);
        await nft.mint(bob, tokenIds.bob);
        return { owner, alice, bob, nft, tokenIds };
    }

    describe('transfer', function () {
        it('should revert by non-owner', async function () {
            const { alice, bob, nft, tokenIds } = await loadFixture(initContracts);
            await expect(nft.connect(bob).transfer(alice, tokenIds.bob)).to.be.revertedWithCustomError(nft, 'OwnableUnauthorizedAccount');
        });

        it('should work by owner', async function () {
            const { owner, alice, nft, tokenIds } = await loadFixture(initContracts);
            await nft.connect(owner).transfer(alice, tokenIds.owner);
            expect(await nft.ownerOf(tokenIds.owner)).to.equal(alice.address);
        });

        it('should work by owner for any account', async function () {
            const { owner, alice, nft, tokenIds } = await loadFixture(initContracts);
            expect(await nft.getApproved(tokenIds.bob)).to.equal(constants.ZERO_ADDRESS);
            await nft.connect(owner).transfer(alice, tokenIds.bob);
            expect(await nft.ownerOf(tokenIds.bob)).to.equal(alice.address);
        });

        it('should revert when recipient account already has 1 nft', async function () {
            const { owner, bob, nft, tokenIds } = await loadFixture(initContracts);
            await expect(nft.connect(owner).transfer(bob, tokenIds.owner)).to.be.revertedWithCustomError(nft, 'OnlyOneNFTPerAddress');
        });

        it('should revert when send non-existen token', async function () {
            const { owner, bob, nft, tokenIds } = await loadFixture(initContracts);
            await expect(nft.connect(owner).transfer(bob, tokenIds.nonexist)).to.be.revertedWithCustomError(nft, 'ERC721NonexistentToken');
        });
    });

    describe('transferFrom', function () {
        it('should revert by non-owner', async function () {
            const { alice, bob, nft, tokenIds } = await loadFixture(initContracts);
            await expect(nft.connect(bob).transferFrom(bob, alice, tokenIds.bob)).to.be.revertedWithCustomError(nft, 'OwnableUnauthorizedAccount');
        });

        it('should work by owner', async function () {
            const { owner, alice, nft, tokenIds } = await loadFixture(initContracts);
            await nft.connect(owner).transferFrom(owner, alice, tokenIds.owner);
            expect(await nft.ownerOf(tokenIds.owner)).to.equal(alice.address);
        });

        it('should work by owner for any account', async function () {
            const { owner, alice, bob, nft, tokenIds } = await loadFixture(initContracts);
            expect(await nft.getApproved(tokenIds.bob)).to.equal(constants.ZERO_ADDRESS);
            await nft.connect(owner).transferFrom(bob, alice, tokenIds.bob);
            expect(await nft.ownerOf(tokenIds.bob)).to.equal(alice.address);
        });

        it('should revert when recipient account already has 1 nft', async function () {
            const { owner, bob, nft, tokenIds } = await loadFixture(initContracts);
            await expect(nft.connect(owner).transferFrom(owner, bob, tokenIds.owner)).to.be.revertedWithCustomError(nft, 'OnlyOneNFTPerAddress');
        });

        it('should revert when send non-existen token', async function () {
            const { owner, bob, nft, tokenIds } = await loadFixture(initContracts);
            await expect(nft.connect(owner).transferFrom(owner, bob, tokenIds.nonexist)).to.be.revertedWithCustomError(nft, 'ERC721NonexistentToken');
        });
    });

    describe('mint', function () {
        it('should revert by non-owner', async function () {
            const { alice, bob, nft, tokenIds } = await loadFixture(initContracts);
            await expect(nft.connect(bob).mint(alice, tokenIds.alice)).to.be.revertedWithCustomError(nft, 'OwnableUnauthorizedAccount');
        });

        it('should work by owner', async function () {
            const { owner, alice, nft, tokenIds } = await loadFixture(initContracts);
            await nft.connect(owner).mint(alice, tokenIds.alice);
            expect(await nft.ownerOf(tokenIds.alice)).to.equal(alice.address);
        });

        it('should revert when account already has 1 nft', async function () {
            const { owner, bob, nft, tokenIds } = await loadFixture(initContracts);
            await expect(nft.connect(owner).mint(bob, tokenIds.another)).to.be.revertedWithCustomError(nft, 'OnlyOneNFTPerAddress');
        });
    });

    describe('burn', function () {
        it('should revert by non-owner', async function () {
            const { bob, nft, tokenIds } = await loadFixture(initContracts);
            await expect(nft.connect(bob).burn(tokenIds.bob)).to.be.revertedWithCustomError(nft, 'OwnableUnauthorizedAccount');
        });

        it('should work by owner', async function () {
            const { owner, nft, tokenIds } = await loadFixture(initContracts);
            await nft.connect(owner).burn(tokenIds.owner);
            await expect(nft.ownerOf(tokenIds.owner)).to.be.revertedWithCustomError(nft, 'ERC721NonexistentToken');
        });

        it('should work by owner for any account', async function () {
            const { owner, bob, nft, tokenIds } = await loadFixture(initContracts);
            expect(await nft.ownerOf(tokenIds.bob)).to.equal(bob.address);
            await nft.connect(owner).burn(tokenIds.bob);
            await expect(nft.ownerOf(tokenIds.bob)).to.be.revertedWithCustomError(nft, 'ERC721NonexistentToken');
        });
    });
});
