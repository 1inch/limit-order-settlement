// SPDX-License-Identifier: MIT

pragma solidity 0.8.23;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";

/**
 * @title KycNFT
 * @notice ERC721 token that allows only one NFT per address and includes transfer, mint and burn logic restricted to the contract owner.
 */
contract KycNFT is Ownable, ERC721 {
    /// @notice Thrown when an address attempts to own more than one NFT.
    error OnlyOneNFTPerAddress();

    /**
     * @notice Constructor that initializes the ERC721 token with a name and a symbol, and sets the contract owner.
     * @param name The name of the token.
     * @param symbol The symbol of the token.
     * @param owner The address of the owner of the contract.
     */
    constructor(string memory name, string memory symbol, address owner) ERC721(name, symbol) Ownable(owner) {}

    /**
     * @notice Transfers a token to a specified address. Only the owner can call this function.
     * @param to The address to transfer the token to.
     * @param tokenId The ID of the token to be transferred.
     */
    function transfer(address to, uint256 tokenId) external onlyOwner {
        _transfer(to, tokenId);
    }

    /**
     * @notice See {transfer} method. This function overrides the ERC721 transferFrom function and can be called by the owner only.
     */
    function transferFrom(address /* from */, address to, uint256 tokenId) public override onlyOwner() {
        _transfer(to, tokenId);
    }

    function _transfer(address to, uint256 tokenId) internal {
        if (_ownerOf(tokenId) == address(0)) revert ERC721NonexistentToken(tokenId);
        _update(to, tokenId, address(0));
    }

    /**
     * @dev Mints a new token to a specified address. Only the owner can call this function.
     * @param to The address to mint the token to.
     * @param tokenId The ID of the token to be minted.
     */
    function mint(address to, uint256 tokenId) external onlyOwner {
        _safeMint(to, tokenId);
    }

    /**
     * @dev Burns a specified token. Only the owner can call this function.
     * @param tokenId The ID of the token to be burned.
     */
    function burn(uint256 tokenId) external onlyOwner {
        _burn(tokenId);
    }

    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        if (to != address(0) && balanceOf(to) > 0) revert OnlyOneNFTPerAddress();
        return super._update(to, tokenId, auth);
    }
}
