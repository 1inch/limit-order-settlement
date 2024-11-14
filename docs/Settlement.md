
## Settlement

Contract to execute limit orders settlement on Mainnet, created by Fusion mode.

### Functions list
- [constructor(limitOrderProtocol, feeToken, accessToken, weth, owner) public](#constructor)
- [_postInteraction(order, extension, orderHash, taker, makingAmount, takingAmount, remainingMakingAmount, extraData) internal](#_postinteraction)
- [_isPriorityFeeValid() internal](#_ispriorityfeevalid)

### Errors list
- [InvalidPriorityFee() ](#invalidpriorityfee)

### Functions
### constructor

```solidity
constructor(address limitOrderProtocol, contract IERC20 feeToken, contract IERC20 accessToken, address weth, address owner) public
```

### _postInteraction

```solidity
function _postInteraction(struct IOrderMixin.Order order, bytes extension, bytes32 orderHash, address taker, uint256 makingAmount, uint256 takingAmount, uint256 remainingMakingAmount, bytes extraData) internal virtual
```

### _isPriorityFeeValid

```solidity
function _isPriorityFeeValid() internal view returns (bool)
```

_Validates priority fee according to the spec
https://snapshot.org/#/1inch.eth/proposal/0xa040c60050147a0f67042ae024673e92e813b5d2c0f748abf70ddfa1ed107cbe
For blocks with baseFee <10.6 gwei – the priorityFee is capped at 70% of the baseFee.
For blocks with baseFee between 10.6 gwei and 104.1 gwei – the priorityFee is capped at 50% of the baseFee.
For blocks with baseFee >104.1 gwei – priorityFee is capped at 65% of the block’s baseFee._

### Errors
### InvalidPriorityFee

```solidity
error InvalidPriorityFee()
```

