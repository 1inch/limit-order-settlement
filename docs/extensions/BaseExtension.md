
## BaseExtension

Contract to define the basic functionality for the limit orders settlement.

### Functions list
- [constructor(limitOrderProtocol) public](#constructor)
- [getMakingAmount(order, , , , takingAmount, , extraData) external](#getmakingamount)
- [getTakingAmount(order, , , , makingAmount, , extraData) external](#gettakingamount)
- [preInteraction(order, extension, orderHash, taker, makingAmount, takingAmount, remainingMakingAmount, extraData) external](#preinteraction)
- [postInteraction(order, extension, orderHash, taker, makingAmount, takingAmount, remainingMakingAmount, extraData) external](#postinteraction)
- [_preInteraction(order, extension, orderHash, taker, makingAmount, takingAmount, remainingMakingAmount, extraData) internal](#_preinteraction)
- [_postInteraction(order, extension, orderHash, taker, makingAmount, takingAmount, remainingMakingAmount, extraData) internal](#_postinteraction)

### Errors list
- [OnlyLimitOrderProtocol() ](#onlylimitorderprotocol)

### Functions
### constructor

```solidity
constructor(address limitOrderProtocol) public
```
Initializes the contract.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| limitOrderProtocol | address | The limit order protocol contract. |

### getMakingAmount

```solidity
function getMakingAmount(struct IOrderMixin.Order order, bytes, bytes32, address, uint256 takingAmount, uint256, bytes extraData) external view returns (uint256)
```
See {IAmountGetter-getMakingAmount}

### getTakingAmount

```solidity
function getTakingAmount(struct IOrderMixin.Order order, bytes, bytes32, address, uint256 makingAmount, uint256, bytes extraData) external view returns (uint256)
```
See {IAmountGetter-getTakingAmount}

### preInteraction

```solidity
function preInteraction(struct IOrderMixin.Order order, bytes extension, bytes32 orderHash, address taker, uint256 makingAmount, uint256 takingAmount, uint256 remainingMakingAmount, bytes extraData) external
```
See {IPreInteraction-preInteraction}

### postInteraction

```solidity
function postInteraction(struct IOrderMixin.Order order, bytes extension, bytes32 orderHash, address taker, uint256 makingAmount, uint256 takingAmount, uint256 remainingMakingAmount, bytes extraData) external
```
See {IPostInteraction-postInteraction}

### _preInteraction

```solidity
function _preInteraction(struct IOrderMixin.Order order, bytes extension, bytes32 orderHash, address taker, uint256 makingAmount, uint256 takingAmount, uint256 remainingMakingAmount, bytes extraData) internal virtual
```

### _postInteraction

```solidity
function _postInteraction(struct IOrderMixin.Order order, bytes extension, bytes32 orderHash, address taker, uint256 makingAmount, uint256 takingAmount, uint256 remainingMakingAmount, bytes extraData) internal virtual
```

### Errors
### OnlyLimitOrderProtocol

```solidity
error OnlyLimitOrderProtocol()
```

