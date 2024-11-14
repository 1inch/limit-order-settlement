
## SimpleSettlement

Contract to execute limit orders settlement, created by Fusion mode.

### Functions list
- [constructor(limitOrderProtocol, feeToken, accessToken, weth, owner) public](#constructor)
- [_postInteraction(order, extension, orderHash, taker, makingAmount, takingAmount, remainingMakingAmount, extraData) internal](#_postinteraction)

### Functions
### constructor

```solidity
constructor(address limitOrderProtocol, contract IERC20 feeToken, contract IERC20 accessToken, address weth, address owner) public
```
Initializes the contract.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| limitOrderProtocol | address | The limit order protocol contract. |
| feeToken | contract IERC20 | The token to charge protocol fees in. |
| accessToken | contract IERC20 | Contract address whose tokens allow filling limit orders with a fee for resolvers that are outside the whitelist. |
| weth | address | The WETH address. |
| owner | address | The owner of the contract. |

### _postInteraction

```solidity
function _postInteraction(struct IOrderMixin.Order order, bytes extension, bytes32 orderHash, address taker, uint256 makingAmount, uint256 takingAmount, uint256 remainingMakingAmount, bytes extraData) internal virtual
```

