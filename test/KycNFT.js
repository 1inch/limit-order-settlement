const { expect, deployContract, constants, trim0x } = require('@1inch/solidity-utils');
const { ethers } = require('hardhat');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { getChainId } = require('./helpers/fixtures');

async function signTokenId(nft, tokenId, signer, chainId) {
    const packedData = ethers.solidityPacked(
        ['address', 'uint256', 'uint256', 'uint256'],
        [await nft.getAddress(), chainId, await nft.nonces(tokenId), tokenId],
    );
    const message = Buffer.from(trim0x(packedData), 'hex');
    return await signer.signMessage(message);
}

describe('KycNFT', function () {
    async function initContracts() {
        const chainId = await getChainId();
        const [owner, alice, bob] = await ethers.getSigners();
        const tokenIds = {
            owner: '0x00',
            alice: '0x01',
            bob: '0x02',
            another: '0x03',
            nonexist: '0xabcdef',
        };
        const nft = await deployContract('KycNFT', ['KycNFT', 'KYC', owner]);
        await nft.mint(owner, tokenIds.owner, '0x');
        await nft.mint(bob, tokenIds.bob, '0x');
        return { owner, alice, bob, nft, tokenIds, chainId };
    }

    describe('transfer', function () {
        it('should revert by non-owner without signature', async function () {
            const { alice, bob, nft, tokenIds } = await loadFixture(initContracts);
            await expect(nft.connect(bob).transfer(alice, tokenIds.bob, '0x')).to.be.revertedWithCustomError(nft, 'OwnableUnauthorizedAccount');
        });

        it('should work by owner', async function () {
            const { owner, alice, nft, tokenIds } = await loadFixture(initContracts);
            await nft.connect(owner).transfer(alice, tokenIds.owner, '0x');
            expect(await nft.ownerOf(tokenIds.owner)).to.equal(alice.address);
        });

        it('should work by owner for any account', async function () {
            const { owner, alice, nft, tokenIds } = await loadFixture(initContracts);
            expect(await nft.getApproved(tokenIds.bob)).to.equal(constants.ZERO_ADDRESS);
            await nft.connect(owner).transfer(alice, tokenIds.bob, '0x');
            expect(await nft.ownerOf(tokenIds.bob)).to.equal(alice.address);
        });

        it('should revert when recipient account already has 1 nft', async function () {
            const { owner, bob, nft, tokenIds } = await loadFixture(initContracts);
            await expect(nft.connect(owner).transfer(bob, tokenIds.owner, '0x')).to.be.revertedWithCustomError(nft, 'OnlyOneNFTPerAddress');
        });

        it('should revert when send non-existen token', async function () {
            const { owner, bob, nft, tokenIds } = await loadFixture(initContracts);
            await expect(nft.connect(owner).transfer(bob, tokenIds.nonexist, '0x')).to.be.revertedWithCustomError(nft, 'ERC721NonexistentToken');
        });

        it('should revert with invalid signature', async function () {
            const { owner, alice, bob, nft, tokenIds, chainId } = await loadFixture(initContracts);
            const signature = await signTokenId(nft, tokenIds.bob, owner, chainId);
            const invalidSignature = signature.substring(-2) + '00';
            await expect(nft.connect(bob).transfer(alice, tokenIds.bob, invalidSignature)).to.be.revertedWithCustomError(nft, 'BadSignature');
        });

        it('should revert with non-owner signature', async function () {
            const { alice, bob, nft, tokenIds, chainId } = await loadFixture(initContracts);
            const signature = await signTokenId(nft, tokenIds.bob, bob, chainId);
            await expect(nft.connect(bob).transfer(alice, tokenIds.bob, signature)).to.be.revertedWithCustomError(nft, 'BadSignature');
        });

        it('should work with owner signature', async function () {
            const { owner, alice, bob, nft, tokenIds, chainId } = await loadFixture(initContracts);
            const signature = await signTokenId(nft, tokenIds.bob, owner, chainId);
            await nft.connect(bob).transfer(alice, tokenIds.bob, signature);
            expect(await nft.ownerOf(tokenIds.bob)).to.equal(alice.address);
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
        it('should revert by non-owner without signature', async function () {
            const { alice, bob, nft, tokenIds } = await loadFixture(initContracts);
            await expect(nft.connect(bob).mint(alice, tokenIds.alice, '0x')).to.be.revertedWithCustomError(nft, 'OwnableUnauthorizedAccount');
        });

        it('should work by owner', async function () {
            const { owner, alice, nft, tokenIds } = await loadFixture(initContracts);
            await nft.connect(owner).mint(alice, tokenIds.alice, '0x');
            expect(await nft.ownerOf(tokenIds.alice)).to.equal(alice.address);
        });

        it('should revert when account already has 1 nft', async function () {
            const { owner, bob, nft, tokenIds } = await loadFixture(initContracts);
            await expect(nft.connect(owner).mint(bob, tokenIds.another, '0x')).to.be.revertedWithCustomError(nft, 'OnlyOneNFTPerAddress');
        });

        it('should revert when tokenId already exist', async function () {
            const { owner, alice, nft, tokenIds } = await loadFixture(initContracts);
            await expect(nft.connect(owner).mint(alice, tokenIds.bob, '0x')).to.be.revertedWithCustomError(nft, 'ERC721InvalidSender');
        });

        it('should revert with invalid signature', async function () {
            const { owner, alice, nft, tokenIds, chainId } = await loadFixture(initContracts);
            const signature = await signTokenId(nft, tokenIds.alice, owner, chainId);
            const invalidSignature = signature.substring(-2) + '00';
            await expect(nft.connect(owner).mint(alice, tokenIds.alice, invalidSignature)).to.be.revertedWithCustomError(nft, 'BadSignature');
        });

        it('should revert with non-owner signature', async function () {
            const { alice, bob, nft, tokenIds, chainId } = await loadFixture(initContracts);
            const signature = await signTokenId(nft, tokenIds.alice, bob, chainId);
            await expect(nft.connect(bob).mint(alice, tokenIds.alice, signature)).to.be.revertedWithCustomError(nft, 'BadSignature');
        });

        it('should work with owner signature', async function () {
            const { owner, alice, bob, nft, tokenIds, chainId } = await loadFixture(initContracts);
            const signature = await signTokenId(nft, tokenIds.alice, owner, chainId);
            await nft.connect(bob).mint(alice, tokenIds.alice, signature);
            expect(await nft.ownerOf(tokenIds.alice)).to.equal(alice.address);
        });
    });

    describe('burn', function () {
        it('should revert by non-owner without signature', async function () {
            const { bob, nft, tokenIds } = await loadFixture(initContracts);
            await expect(nft.connect(bob).burn(tokenIds.bob, '0x')).to.be.revertedWithCustomError(nft, 'OwnableUnauthorizedAccount');
        });

        it('should work by owner', async function () {
            const { owner, nft, tokenIds } = await loadFixture(initContracts);
            await nft.connect(owner).burn(tokenIds.owner, '0x');
            await expect(nft.ownerOf(tokenIds.owner)).to.be.revertedWithCustomError(nft, 'ERC721NonexistentToken');
        });

        it('should work by owner for any account', async function () {
            const { owner, bob, nft, tokenIds } = await loadFixture(initContracts);
            expect(await nft.ownerOf(tokenIds.bob)).to.equal(bob.address);
            await nft.connect(owner).burn(tokenIds.bob, '0x');
            await expect(nft.ownerOf(tokenIds.bob)).to.be.revertedWithCustomError(nft, 'ERC721NonexistentToken');
        });

        it('should revert with invalid signature', async function () {
            const { owner, nft, tokenIds, chainId } = await loadFixture(initContracts);
            const signature = await signTokenId(nft, tokenIds.bob, owner, chainId);
            const invalidSignature = signature.substring(-2) + '00';
            await expect(nft.connect(owner).burn(tokenIds.bob, invalidSignature)).to.be.revertedWithCustomError(nft, 'BadSignature');
        });

        it('should revert with non-owner signature', async function () {
            const { bob, nft, tokenIds, chainId } = await loadFixture(initContracts);
            const signature = await signTokenId(nft, tokenIds.bob, bob, chainId);
            await expect(nft.connect(bob).burn(tokenIds.bob, signature)).to.be.revertedWithCustomError(nft, 'BadSignature');
        });

        it('should work with owner signature', async function () {
            const { owner, bob, nft, tokenIds, chainId } = await loadFixture(initContracts);
            const signature = await signTokenId(nft, tokenIds.bob, owner, chainId);
            await nft.connect(bob).burn(tokenIds.bob, signature);
            await expect(nft.ownerOf(tokenIds.bob)).to.be.revertedWithCustomError(nft, 'ERC721NonexistentToken');
        });
    });
});
