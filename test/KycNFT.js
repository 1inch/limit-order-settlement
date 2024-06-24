const { expect, deployContract, constants, trim0x } = require('@1inch/solidity-utils');
const { ethers } = require('hardhat');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { getChainId } = require('./helpers/fixtures');

async function signTokenId(nft, to, tokenId, signer, chainId) {
    const packedData = ethers.solidityPacked(
        ['address', 'uint256', 'address', 'uint256', 'uint256'],
        [await nft.getAddress(), chainId, to, await nft.nonces(tokenId), tokenId],
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
        await nft.mint(owner, tokenIds.owner);
        await nft.mint(bob, tokenIds.bob);
        return { owner, alice, bob, nft, tokenIds, chainId };
    }

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
            const { owner, alice, nft, tokenIds } = await loadFixture(initContracts);
            await expect(nft.connect(owner).transferFrom(owner, alice, tokenIds.nonexist)).to.be.revertedWithCustomError(nft, 'ERC721NonexistentToken');
        });
    });

    describe('transferFrom with signature', function () {
        it('should revert with signature by non-owner', async function () {
            const { alice, bob, nft, tokenIds, chainId } = await loadFixture(initContracts);
            const signature = await signTokenId(nft, alice.address, tokenIds.bob, bob, chainId);
            await expect(nft.connect(bob)['transferFrom(address,address,uint256,bytes)'](bob, alice, tokenIds.bob, signature))
                .to.be.revertedWithCustomError(nft, 'BadSignature');
        });

        it('should work with signature by owner', async function () {
            const { owner, bob, alice, nft, tokenIds, chainId } = await loadFixture(initContracts);
            const transferToken = tokenIds.bob;
            const signature = await signTokenId(nft, alice.address, transferToken, owner, chainId);
            await nft.connect(bob)['transferFrom(address,address,uint256,bytes)'](bob, alice, transferToken, signature);
            expect(await nft.ownerOf(tokenIds.bob)).to.equal(alice.address);
        });

        it('should revert with signature by owner and transfer someone else\'s token', async function () {
            const { owner, bob, alice, nft, tokenIds, chainId } = await loadFixture(initContracts);
            const transferToken = tokenIds.owner;
            const signature = await signTokenId(nft, alice.address, transferToken, owner, chainId);
            await expect(nft.connect(bob)['transferFrom(address,address,uint256,bytes)'](bob, alice, transferToken, signature))
                .to.be.revertedWithCustomError(nft, 'ERC721IncorrectOwner');
        });

        it('should revert when recipient account already has 1 nft', async function () {
            const { owner, bob, nft, tokenIds, chainId } = await loadFixture(initContracts);
            const signature = await signTokenId(nft, owner.address, tokenIds.bob, owner, chainId);
            await expect(nft.connect(owner)['transferFrom(address,address,uint256,bytes)'](bob, owner, tokenIds.bob, signature))
                .to.be.revertedWithCustomError(nft, 'OnlyOneNFTPerAddress');
        });

        it('should revert when send non-existen token', async function () {
            const { owner, alice, nft, tokenIds, chainId } = await loadFixture(initContracts);
            const signature = await signTokenId(nft, alice.address, tokenIds.nonexist, owner, chainId);
            await expect(nft.connect(owner)['transferFrom(address,address,uint256,bytes)'](owner, alice, tokenIds.nonexist, signature))
                .to.be.revertedWithCustomError(nft, 'ERC721NonexistentToken');
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

        it('should revert when tokenId already exist', async function () {
            const { owner, alice, nft, tokenIds } = await loadFixture(initContracts);
            await expect(nft.connect(owner).mint(alice, tokenIds.bob)).to.be.revertedWithCustomError(nft, 'ERC721InvalidSender');
        });
    });

    describe('mint with signature', function () {
        it('should revert with invalid signature', async function () {
            const { owner, alice, nft, tokenIds, chainId } = await loadFixture(initContracts);
            const signature = await signTokenId(nft, alice.address, tokenIds.alice, owner, chainId);
            const invalidSignature = signature.substring(-2) + '00';
            await expect(nft.connect(owner)['mint(address,uint256,bytes)'](alice, tokenIds.alice, invalidSignature))
                .to.be.revertedWithCustomError(nft, 'BadSignature');
        });

        it('should revert with invalid signature when frontrun and change to-address', async function () {
            const { owner, bob, alice, nft, tokenIds, chainId } = await loadFixture(initContracts);
            const signature = await signTokenId(nft, alice.address, tokenIds.alice, owner, chainId);
            const invalidSignature = signature.substring(-2) + '00';
            await expect(nft.connect(owner)['mint(address,uint256,bytes)'](bob, tokenIds.alice, invalidSignature))
                .to.be.revertedWithCustomError(nft, 'BadSignature');
        });

        it('should revert with non-owner signature', async function () {
            const { alice, bob, nft, tokenIds, chainId } = await loadFixture(initContracts);
            const signature = await signTokenId(nft, alice.address, tokenIds.alice, bob, chainId);
            await expect(nft.connect(bob)['mint(address,uint256,bytes)'](alice, tokenIds.alice, signature))
                .to.be.revertedWithCustomError(nft, 'BadSignature');
        });

        it('should work with owner signature', async function () {
            const { owner, alice, bob, nft, tokenIds, chainId } = await loadFixture(initContracts);
            const signature = await signTokenId(nft, alice.address, tokenIds.alice, owner, chainId);
            await nft.connect(bob)['mint(address,uint256,bytes)'](alice, tokenIds.alice, signature);
            expect(await nft.ownerOf(tokenIds.alice)).to.equal(alice.address);
        });

        it('should revert when account already has 1 nft', async function () {
            const { owner, bob, nft, tokenIds, chainId } = await loadFixture(initContracts);
            const signature = await signTokenId(nft, bob.address, tokenIds.another, owner, chainId);
            await expect(nft.connect(owner)['mint(address,uint256,bytes)'](bob, tokenIds.another, signature))
                .to.be.revertedWithCustomError(nft, 'OnlyOneNFTPerAddress');
        });

        it('should revert when tokenId already exist', async function () {
            const { owner, alice, nft, tokenIds, chainId } = await loadFixture(initContracts);
            const signature = await signTokenId(nft, alice.address, tokenIds.bob, owner, chainId);
            await expect(nft.connect(owner)['mint(address,uint256,bytes)'](alice, tokenIds.bob, signature))
                .to.be.revertedWithCustomError(nft, 'ERC721InvalidSender');
        });
    });

    describe('burn', function () {
        it('should revert by non-owner when it burns someone else\'s token', async function () {
            const { bob, nft, tokenIds } = await loadFixture(initContracts);
            await expect(nft.connect(bob).burn(tokenIds.owner)).to.be.revertedWithCustomError(nft, 'ERC721InsufficientApproval');
        });

        it('should work by non-owner when it burns its token', async function () {
            const { bob, nft, tokenIds } = await loadFixture(initContracts);
            await nft.connect(bob).burn(tokenIds.bob);
            await expect(nft.ownerOf(tokenIds.bob)).to.be.revertedWithCustomError(nft, 'ERC721NonexistentToken');
        });

        it('should work by non-owner when it burns approved token', async function () {
            const { alice, bob, nft, tokenIds } = await loadFixture(initContracts);
            await nft.connect(bob).approve(alice, tokenIds.bob);
            await nft.connect(alice).burn(tokenIds.bob);
            await expect(nft.ownerOf(tokenIds.bob)).to.be.revertedWithCustomError(nft, 'ERC721NonexistentToken');
        });

        it('should work by owner', async function () {
            const { owner, nft, tokenIds } = await loadFixture(initContracts);
            await nft.connect(owner).burn(tokenIds.owner);
            await expect(nft.ownerOf(tokenIds.owner)).to.be.revertedWithCustomError(nft, 'ERC721NonexistentToken');
        });

        it('should work by owner for any token', async function () {
            const { owner, bob, nft, tokenIds } = await loadFixture(initContracts);
            expect(await nft.ownerOf(tokenIds.bob)).to.equal(bob.address);
            await nft.connect(owner).burn(tokenIds.bob);
            await expect(nft.ownerOf(tokenIds.bob)).to.be.revertedWithCustomError(nft, 'ERC721NonexistentToken');
        });
    });
});
