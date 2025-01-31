const { expect, deployContract, constants } = require('@1inch/solidity-utils');
const { ethers } = require('hardhat');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { getChainId } = require('./helpers/fixtures');

const MINT = {
    Mint: [
        { name: 'to', type: 'address' },
        { name: 'nonce', type: 'uint256' },
        { name: 'tokenId', type: 'uint256' },
        { name: 'deadline', type: 'uint256' },
    ],
};
const TRANSFER_FROM = {
    TransferFrom: MINT.Mint,
};

async function signTokenId(types, eip712, nft, to, tokenId, signer, chainId, deadline) {
    const domain = {
        name: eip712.name,
        version: eip712.version,
        chainId,
        verifyingContract: await nft.getAddress(),
    };
    const values = {
        to,
        nonce: await nft.nonces(tokenId),
        tokenId,
        deadline,
    };
    return signer.signTypedData(domain, types, values);
}

describe('KycNFT', function () {
    async function initContracts() {
        const chainId = await getChainId();
        const [owner, alice, bob, charlie] = await ethers.getSigners();
        const tokenIds = {
            owner: '0x00',
            alice: '0x01',
            bob: '0x02',
            another: '0x03',
            nonexist: '0xabcdef',
        };
        const eip712 = { name: 'KycNFT', version: '1' };
        const nft = await deployContract('KycNFT', [eip712.name, 'KYC', eip712.version, owner]);
        await nft.mint(owner, tokenIds.owner);
        await nft.mint(bob, tokenIds.bob);
        const deadline = '0xffffffff';
        return { owner, alice, bob, charlie, nft, tokenIds, chainId, eip712, deadline };
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
            const { alice, bob, nft, tokenIds, chainId, eip712, deadline } = await loadFixture(initContracts);
            const signature = await signTokenId(TRANSFER_FROM, eip712, nft, alice.address, tokenIds.bob, bob, chainId, deadline);
            await expect(nft.connect(bob)['transferFrom(address,address,uint256,uint256,bytes)'](bob, alice, tokenIds.bob, deadline, signature))
                .to.be.revertedWithCustomError(nft, 'BadSignature');
        });

        it('should work with signature by owner', async function () {
            const { owner, bob, alice, nft, tokenIds, chainId, eip712, deadline } = await loadFixture(initContracts);
            const transferToken = tokenIds.bob;
            const signature = await signTokenId(TRANSFER_FROM, eip712, nft, alice.address, transferToken, owner, chainId, deadline);
            await nft.connect(bob)['transferFrom(address,address,uint256,uint256,bytes)'](bob, alice, transferToken, deadline, signature);
            expect(await nft.ownerOf(tokenIds.bob)).to.equal(alice.address);
        });

        it('should revert with signature by owner and transfer someone else\'s token', async function () {
            const { owner, bob, alice, nft, tokenIds, chainId, eip712, deadline } = await loadFixture(initContracts);
            const transferToken = tokenIds.owner;
            const signature = await signTokenId(TRANSFER_FROM, eip712, nft, alice.address, transferToken, owner, chainId, deadline);
            await expect(nft.connect(bob)['transferFrom(address,address,uint256,uint256,bytes)'](bob, alice, transferToken, deadline, signature))
                .to.be.revertedWithCustomError(nft, 'ERC721IncorrectOwner');
        });

        it('should revert when recipient account already has 1 nft', async function () {
            const { owner, bob, nft, tokenIds, chainId, eip712, deadline } = await loadFixture(initContracts);
            const signature = await signTokenId(TRANSFER_FROM, eip712, nft, owner.address, tokenIds.bob, owner, chainId, deadline);
            await expect(nft.connect(owner)['transferFrom(address,address,uint256,uint256,bytes)'](bob, owner, tokenIds.bob, deadline, signature))
                .to.be.revertedWithCustomError(nft, 'OnlyOneNFTPerAddress');
        });

        it('should revert when send non-existen token', async function () {
            const { owner, alice, nft, tokenIds, chainId, eip712, deadline } = await loadFixture(initContracts);
            const signature = await signTokenId(TRANSFER_FROM, eip712, nft, alice.address, tokenIds.nonexist, owner, chainId, deadline);
            await expect(nft.connect(owner)['transferFrom(address,address,uint256,uint256,bytes)'](owner, alice, tokenIds.nonexist, deadline, signature))
                .to.be.revertedWithCustomError(nft, 'ERC721NonexistentToken');
        });

        it('should revert after deadline expired', async function () {
            const { alice, bob, nft, tokenIds, chainId, eip712 } = await loadFixture(initContracts);
            const deadline = '0x01';
            const signature = await signTokenId(TRANSFER_FROM, eip712, nft, alice.address, tokenIds.bob, bob, chainId, deadline);
            await expect(nft.connect(bob)['transferFrom(address,address,uint256,uint256,bytes)'](bob, alice, tokenIds.bob, deadline, signature))
                .to.be.revertedWithCustomError(nft, 'SignatureExpired');
        });

        it('should revert after another differrent transfer', async function () {
            const { owner, alice, bob, charlie, nft, tokenIds, chainId, eip712, deadline } = await loadFixture(initContracts);
            const signature = await signTokenId(TRANSFER_FROM, eip712, nft, alice.address, tokenIds.bob, bob, chainId, deadline);
            await nft.connect(owner).transferFrom(bob, charlie, tokenIds.bob);
            await expect(nft.connect(bob)['transferFrom(address,address,uint256,uint256,bytes)'](bob, alice, tokenIds.bob, deadline, signature))
                .to.be.revertedWithCustomError(nft, 'BadSignature');
        });

        it('should revert after burning', async function () {
            const { owner, alice, bob, nft, tokenIds, chainId, eip712, deadline } = await loadFixture(initContracts);
            const signature = await signTokenId(TRANSFER_FROM, eip712, nft, alice.address, tokenIds.bob, bob, chainId, deadline);
            await nft.connect(owner).burn(tokenIds.bob);
            await expect(nft.connect(bob)['transferFrom(address,address,uint256,uint256,bytes)'](bob, alice, tokenIds.bob, deadline, signature))
                .to.be.revertedWithCustomError(nft, 'BadSignature');
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
            const { owner, alice, nft, tokenIds, chainId, eip712, deadline } = await loadFixture(initContracts);
            const signature = await signTokenId(MINT, eip712, nft, alice.address, tokenIds.alice, owner, chainId, deadline);
            const invalidSignature = signature.substring(-2) + '00';
            await expect(nft.connect(owner)['mint(address,uint256,uint256,bytes)'](alice, tokenIds.alice, deadline, invalidSignature))
                .to.be.revertedWithCustomError(nft, 'BadSignature');
        });

        it('should revert with invalid signature when frontrun and change to-address', async function () {
            const { owner, bob, alice, nft, tokenIds, chainId, eip712, deadline } = await loadFixture(initContracts);
            const signature = await signTokenId(MINT, eip712, nft, alice.address, tokenIds.alice, owner, chainId, deadline);
            const invalidSignature = signature.substring(-2) + '00';
            await expect(nft.connect(owner)['mint(address,uint256,uint256,bytes)'](bob, tokenIds.alice, deadline, invalidSignature))
                .to.be.revertedWithCustomError(nft, 'BadSignature');
        });

        it('should revert with non-owner signature', async function () {
            const { alice, bob, nft, tokenIds, chainId, eip712, deadline } = await loadFixture(initContracts);
            const signature = await signTokenId(MINT, eip712, nft, alice.address, tokenIds.alice, bob, chainId, deadline);
            await expect(nft.connect(bob)['mint(address,uint256,uint256,bytes)'](alice, tokenIds.alice, deadline, signature))
                .to.be.revertedWithCustomError(nft, 'BadSignature');
        });

        it('should work with owner signature', async function () {
            const { owner, alice, bob, nft, tokenIds, chainId, eip712, deadline } = await loadFixture(initContracts);
            const signature = await signTokenId(MINT, eip712, nft, alice.address, tokenIds.alice, owner, chainId, deadline);
            await nft.connect(bob)['mint(address,uint256,uint256,bytes)'](alice, tokenIds.alice, deadline, signature);
            expect(await nft.ownerOf(tokenIds.alice)).to.equal(alice.address);
        });

        it('should revert when account already has 1 nft', async function () {
            const { owner, bob, nft, tokenIds, chainId, eip712, deadline } = await loadFixture(initContracts);
            const signature = await signTokenId(MINT, eip712, nft, bob.address, tokenIds.another, owner, chainId, deadline);
            await expect(nft.connect(owner)['mint(address,uint256,uint256,bytes)'](bob, tokenIds.another, deadline, signature))
                .to.be.revertedWithCustomError(nft, 'OnlyOneNFTPerAddress');
        });

        it('should revert when tokenId already exist', async function () {
            const { owner, alice, nft, tokenIds, chainId, eip712, deadline } = await loadFixture(initContracts);
            const signature = await signTokenId(MINT, eip712, nft, alice.address, tokenIds.bob, owner, chainId, deadline);
            await expect(nft.connect(owner)['mint(address,uint256,uint256,bytes)'](alice, tokenIds.bob, deadline, signature))
                .to.be.revertedWithCustomError(nft, 'ERC721InvalidSender');
        });

        it('should revert after deadline expired', async function () {
            const { owner, alice, nft, tokenIds, chainId, eip712 } = await loadFixture(initContracts);
            const deadline = '0x01';
            const signature = await signTokenId(MINT, eip712, nft, alice.address, tokenIds.bob, owner, chainId, deadline);
            await expect(nft.connect(owner)['mint(address,uint256,uint256,bytes)'](alice, tokenIds.bob, deadline, signature))
                .to.be.revertedWithCustomError(nft, 'SignatureExpired');
        });

        it('should revert after burning', async function () {
            const { owner, alice, nft, tokenIds, chainId, eip712, deadline } = await loadFixture(initContracts);
            const signature = await signTokenId(MINT, eip712, nft, alice.address, tokenIds.bob, owner, chainId, deadline);
            await nft.connect(owner).burn(tokenIds.bob);
            await expect(nft.connect(owner)['mint(address,uint256,uint256,bytes)'](alice, tokenIds.bob, deadline, signature))
                .to.be.revertedWithCustomError(nft, 'BadSignature');
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
