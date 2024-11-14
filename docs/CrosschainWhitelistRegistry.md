
## CrosschainWhitelistRegistry

The contract manages a promotees for crosschain resolvers. It also includes an
emergency rescue function for tokens sent to the contract accidentally.

### Functions list
- [constructor(_whitelistRegistry) public](#constructor)
- [rescueFunds(token_, amount) external](#rescuefunds)
- [promote(chainId, promotee) external](#promote)
- [getPromotees(chainId) external](#getpromotees)

### Events list
- [Promotion(promoter, chainId, promotee) ](#promotion)

### Errors list
- [SamePromotee() ](#samepromotee)

### Functions
### constructor

```solidity
constructor(contract WhitelistRegistry _whitelistRegistry) public
```

### rescueFunds

```solidity
function rescueFunds(contract IERC20 token_, uint256 amount) external
```
Allows the contract owner to recover any tokens accidentally sent to the contract.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| token_ | contract IERC20 | The token to recover. |
| amount | uint256 | The amount of tokens to recover. |

### promote

```solidity
function promote(uint256 chainId, address promotee) external
```
Registers a worker for the resolver to settle orders.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| chainId | uint256 | The chain ID where the worker will assigned. |
| promotee | address | The worker's address. |

### getPromotees

```solidity
function getPromotees(uint256 chainId) external view returns (address[] promotees)
```
Returns the worker list for a particular chain ID.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| chainId | uint256 | The chain ID to get the promoted addresses for. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
promotees | address[] | A list of worker addresses. |

### Events
### Promotion

```solidity
event Promotion(address promoter, uint256 chainId, address promotee)
```
Emitted when a new worker for a resolver is set.

### Errors
### SamePromotee

```solidity
error SamePromotee()
```

