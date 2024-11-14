
## IntegratorFeeExtension

Abstract contract designed to integrate fee processing within the post-interaction phase of order execution.

### Functions list
- [constructor(weth) internal](#constructor)
- [receive() external](#receive)
- [_postInteraction(order, extension, orderHash, taker, makingAmount, takingAmount, remainingMakingAmount, extraData) internal](#_postinteraction)
- [rescueFunds(token, amount) external](#rescuefunds)

### Errors list
- [EthTransferFailed() ](#ethtransferfailed)

### Functions
### constructor

```solidity
constructor(address weth) internal
```

### receive

```solidity
receive() external payable
```
Fallback function to receive ETH.

### _postInteraction

```solidity
function _postInteraction(struct IOrderMixin.Order order, bytes extension, bytes32 orderHash, address taker, uint256 makingAmount, uint256 takingAmount, uint256 remainingMakingAmount, bytes extraData) internal virtual
```

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| order | struct IOrderMixin.Order |  |
| extension | bytes |  |
| orderHash | bytes32 |  |
| taker | address |  |
| makingAmount | uint256 |  |
| takingAmount | uint256 |  |
| remainingMakingAmount | uint256 |  |
| extraData | bytes | Structured data of length n bytes, segmented as follows: [0:2]   - Fee percentage in basis points. [2:22]  - Integrator address. [22:42] - Custom receiver address. [42:n]  - ExtraData for other extensions, not utilized by this integration fee extension. [n] - Bitmap indicating usage flags, where `xxxx xx1x` signifies integration fee usage. Other bits in this bitmap are not used by this extension. |

### rescueFunds

```solidity
function rescueFunds(contract IERC20 token, uint256 amount) external
```
Retrieves funds accidently sent directly to the contract address

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| token | contract IERC20 | ERC20 token to retrieve |
| amount | uint256 | amount to retrieve |

### Errors
### EthTransferFailed

```solidity
error EthTransferFailed()
```

_Eth transfer failed. The target fallback may have reverted._

