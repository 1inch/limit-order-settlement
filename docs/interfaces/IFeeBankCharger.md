
## IFeeBankCharger

### Functions list
- [FEE_BANK() external](#fee_bank)
- [availableCredit(account) external](#availablecredit)
- [increaseAvailableCredit(account, amount) external](#increaseavailablecredit)
- [decreaseAvailableCredit(account, amount) external](#decreaseavailablecredit)

### Functions
### FEE_BANK

```solidity
function FEE_BANK() external view returns (contract IFeeBank)
```
Returns the instance of the FeeBank contract.

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
[0] | contract IFeeBank | The instance of the FeeBank contract. |

### availableCredit

```solidity
function availableCredit(address account) external view returns (uint256)
```
Returns the available credit for a given account.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| account | address | The address of the account for which the available credit is being queried. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
[0] | uint256 | The available credit of the queried account. |

### increaseAvailableCredit

```solidity
function increaseAvailableCredit(address account, uint256 amount) external returns (uint256 allowance)
```
Increases the available credit of a given account by a specified amount.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| account | address | The address of the account for which the available credit is being increased. |
| amount | uint256 | The amount by which the available credit will be increased. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
allowance | uint256 | The updated available credit of the specified account. |

### decreaseAvailableCredit

```solidity
function decreaseAvailableCredit(address account, uint256 amount) external returns (uint256 allowance)
```
Decreases the available credit of a given account by a specified amount.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| account | address | The address of the account for which the available credit is being decreased. |
| amount | uint256 | The amount by which the available credit will be decreased. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
allowance | uint256 | The updated available credit of the specified account. |

