
## WhitelistRegistry

The contract manages a whitelist for trading resolvers, providing functions to register,
promote and remove addresses, as well as setting various thresholds and limits. It also includes an
emergency rescue function for tokens sent to the contract accidentally.

### Functions list
- [constructor(token_, resolverPercentageThreshold_) public](#constructor)
- [rescueFunds(token_, amount) external](#rescuefunds)
- [setResolverPercentageThreshold(resolverPercentageThreshold_) external](#setresolverpercentagethreshold)
- [register() external](#register)
- [promote(chainId, promotee) external](#promote)
- [clean() external](#clean)
- [getWhitelist() external](#getwhitelist)
- [getPromotees(chainId) external](#getpromotees)

### Events list
- [Registered(addr) ](#registered)
- [Unregistered(addr) ](#unregistered)
- [ResolverPercentageThresholdSet(resolverPercentageThreshold) ](#resolverpercentagethresholdset)
- [Promotion(promoter, chainId, promotee) ](#promotion)

### Errors list
- [BalanceLessThanThreshold() ](#balancelessthanthreshold)
- [AlreadyRegistered() ](#alreadyregistered)
- [SamePromotee() ](#samepromotee)
- [InvalidThreshold() ](#invalidthreshold)

### Functions
### constructor

```solidity
constructor(contract IERC20 token_, uint256 resolverPercentageThreshold_) public
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

### setResolverPercentageThreshold

```solidity
function setResolverPercentageThreshold(uint256 resolverPercentageThreshold_) external
```
Allows the contract owner to set a new resolver threshold.
The resolver threshold is the minimum total supply percentage required to get into the whitelist.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| resolverPercentageThreshold_ | uint256 | The new resolver threshold. |

### register

```solidity
function register() external
```
Attempts to register the caller in the whitelist.

_Reverts if the caller's total supply percentage is below the resolver threshold._

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

### clean

```solidity
function clean() external
```
Cleans the whitelist by removing addresses that fall below the resolver threshold.

### getWhitelist

```solidity
function getWhitelist() external view returns (address[])
```
Returns the addresses in the whitelist.

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
[0] | address[] | whitelist A list of whitelisted addresses. |

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
### Registered

```solidity
event Registered(address addr)
```
Emitted after a new resolver is registered.

### Unregistered

```solidity
event Unregistered(address addr)
```
Emitted when a resolver is pushed out of whitelist.

### ResolverPercentageThresholdSet

```solidity
event ResolverPercentageThresholdSet(uint256 resolverPercentageThreshold)
```
Emitted when the new minimum total supply percentage to get into the whitelist is set.

### Promotion

```solidity
event Promotion(address promoter, uint256 chainId, address promotee)
```
Emitted when a new worker for a resolver is set.

### Errors
### BalanceLessThanThreshold

```solidity
error BalanceLessThanThreshold()
```

### AlreadyRegistered

```solidity
error AlreadyRegistered()
```

### SamePromotee

```solidity
error SamePromotee()
```

### InvalidThreshold

```solidity
error InvalidThreshold()
```

