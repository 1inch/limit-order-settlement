
## PowerPod

The contract combines farming and delegation features of pods with voting power calculations for the participating accounts.

_Limits pods number and the gas usage per pod._

### Functions list
- [constructor(name_, symbol_, st1inch) public](#constructor)
- [votingPowerOf(account) external](#votingpowerof)

### Functions
### constructor

```solidity
constructor(string name_, string symbol_, contract ISt1inch st1inch) public
```

### votingPowerOf

```solidity
function votingPowerOf(address account) external view virtual returns (uint256)
```

_Returns the voting power of the specified account at the current block._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| account | address | The account to get the voting power for. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
[0] | uint256 | votingPower The voting power of the account. |

