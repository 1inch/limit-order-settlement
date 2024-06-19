// SPDX-License-Identifier: MIT

pragma solidity 0.8.23;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";

contract KycNFT is Ownable, ERC721 {
    error OnlyOneNFTPerAddress();

    constructor(string memory name, string memory symbol, address owner) ERC721(name, symbol) Ownable(owner) {}

    function transfer(address to, uint256 tokenId) external onlyOwner {
        if (_ownerOf(tokenId) == address(0)) revert ERC721NonexistentToken(tokenId);
        _update(to, tokenId, address(0));
    }

    function transferFrom(address /* from */, address to, uint256 tokenId) public override onlyOwner() {
        if (_ownerOf(tokenId) == address(0)) revert ERC721NonexistentToken(tokenId);
        _update(to, tokenId, address(0));
    }

    function mint(address to, uint256 tokenId) external onlyOwner {
        _safeMint(to, tokenId);
    }

    function burn(uint256 tokenId) external onlyOwner {
        _burn(tokenId);
    }

    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        if (to != address(0) && balanceOf(to) > 0) revert OnlyOneNFTPerAddress();
        return super._update(to, tokenId, auth);
    }
}
