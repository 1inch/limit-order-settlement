
## IFeeBank

### Functions list
- [availableCredit(account) external](#availablecredit)
- [deposit(amount) external](#deposit)
- [depositFor(account, amount) external](#depositfor)
- [depositWithPermit(amount, permit) external](#depositwithpermit)
- [depositForWithPermit(account, amount, permit) external](#depositforwithpermit)
- [withdraw(amount) external](#withdraw)
- [withdrawTo(account, amount) external](#withdrawto)

### Functions
### availableCredit

```solidity
function availableCredit(address account) external view returns (uint256 availableCredit)
```
Returns the available credit for a given account in the FeeBank contract.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| account | address | The address of the account for which the available credit is being queried. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
availableCredit | uint256 | The available credit of the queried account. |

### deposit

```solidity
function deposit(uint256 amount) external returns (uint256 totalAvailableCredit)
```
Increases the caller's available credit by the specified amount.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| amount | uint256 | The amount of credit to be added to the caller's account. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
totalAvailableCredit | uint256 | The updated available credit of the caller's account. |

### depositFor

```solidity
function depositFor(address account, uint256 amount) external returns (uint256 totalAvailableCredit)
```
Increases the specified account's available credit by the specified amount.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| account | address | The address of the account for which the available credit is being increased. |
| amount | uint256 | The amount of credit to be added to the account. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
totalAvailableCredit | uint256 | The updated available credit of the specified account. |

### depositWithPermit

```solidity
function depositWithPermit(uint256 amount, bytes permit) external returns (uint256 totalAvailableCredit)
```
Increases the caller's available credit by a specified amount with permit.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| amount | uint256 | The amount of credit to be added to the caller's account. |
| permit | bytes | The permit data authorizing the transaction. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
totalAvailableCredit | uint256 | The updated available credit of the caller's account. |

### depositForWithPermit

```solidity
function depositForWithPermit(address account, uint256 amount, bytes permit) external returns (uint256 totalAvailableCredit)
```
Increases the specified account's available credit by a specified amount with permit.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| account | address | The address of the account for which the available credit is being increased. |
| amount | uint256 | The amount of credit to be added to the account. |
| permit | bytes | The permit data authorizing the transaction. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
totalAvailableCredit | uint256 | The updated available credit of the specified account. |

### withdraw

```solidity
function withdraw(uint256 amount) external returns (uint256 totalAvailableCredit)
```
Withdraws a specified amount of credit from the caller's account.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| amount | uint256 | The amount of credit to be withdrawn from the caller's account. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
totalAvailableCredit | uint256 | The updated available credit of the caller's account. |

### withdrawTo

```solidity
function withdrawTo(address account, uint256 amount) external returns (uint256 totalAvailableCredit)
```
Withdraws a specified amount of credit to the specified account.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| account | address | The address of the account to which the credit is being withdrawn. |
| amount | uint256 | The amount of credit to be withdrawn. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
totalAvailableCredit | uint256 | The updated available credit of the caller's account. |

