
## KycNFT

ERC721 token that allows only one NFT per address and includes transfer, mint and burn logic restricted to the contract owner.

### Functions list
- [constructor(name, symbol, owner) public](#constructor)
- [transferFrom(from, to, tokenId) public](#transferfrom)
- [transferFrom(from, to, tokenId, signature) public](#transferfrom)
- [mint(to, tokenId) external](#mint)
- [mint(to, tokenId, signature) external](#mint)
- [burn(tokenId) public](#burn)
- [_update(to, tokenId, auth) internal](#_update)

### Errors list
- [OnlyOneNFTPerAddress() ](#onlyonenftperaddress)
- [BadSignature() ](#badsignature)

### Functions
### constructor

```solidity
constructor(string name, string symbol, address owner) public
```
Constructor that initializes the ERC721 token with a name and a symbol, and sets the contract owner.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| name | string | The name of the token. |
| symbol | string | The symbol of the token. |
| owner | address | The address of the owner of the contract. |

### transferFrom

```solidity
function transferFrom(address from, address to, uint256 tokenId) public
```
Transfers a token to a specified address. Only the owner can call this function.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| from | address | The address to transfer the token from. |
| to | address | The address to transfer the token to. |
| tokenId | uint256 | The ID of the token to be transferred. |

### transferFrom

```solidity
function transferFrom(address from, address to, uint256 tokenId, bytes signature) public
```
Transfers a token from account to another by token owner. This function using a valid owner's signature.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| from | address | The address to transfer the token from. |
| to | address | The address to transfer the token to. |
| tokenId | uint256 | The ID of the token to be transferred. |
| signature | bytes | The signature of the owner permitting the transfer. |

### mint

```solidity
function mint(address to, uint256 tokenId) external
```

_Mints a new token to a specified address. Only the owner can call this function._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| to | address | The address to mint the token to. |
| tokenId | uint256 | The ID of the token to be minted. |

### mint

```solidity
function mint(address to, uint256 tokenId, bytes signature) external
```
See {mint} method. This function using a valid owner's signature instead of only owner permission.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| to | address |  |
| tokenId | uint256 |  |
| signature | bytes | The signature of the owner permitting the mint. |

### burn

```solidity
function burn(uint256 tokenId) public
```

_Burns a specified token. The owner can burn any token._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| tokenId | uint256 | The ID of the token to be burned. |

### _update

```solidity
function _update(address to, uint256 tokenId, address auth) internal returns (address)
```

_Transfers `tokenId` from its current owner to `to`, or alternatively mints (or burns) if the current owner
(or `to`) is the zero address. Returns the owner of the `tokenId` before the update.

The `auth` argument is optional. If the value passed is non 0, then this function will check that
`auth` is either the owner of the token, or approved to operate on the token (by the owner).

Emits a {Transfer} event.

NOTE: If overriding this function in a way that tracks balances, see also {_increaseBalance}._

### Errors
### OnlyOneNFTPerAddress

```solidity
error OnlyOneNFTPerAddress()
```
Thrown when an address attempts to own more than one NFT.

### BadSignature

```solidity
error BadSignature()
```
Thrown when signature is incorrect.

