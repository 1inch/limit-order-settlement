
## FeeBankCharger

FeeBankCharger contract implements logic to increase or decrease users' credits in FeeBank.

### Functions list
- [constructor(feeToken, owner) public](#constructor)
- [availableCredit(account) external](#availablecredit)
- [increaseAvailableCredit(account, amount) external](#increaseavailablecredit)
- [decreaseAvailableCredit(account, amount) external](#decreaseavailablecredit)
- [_chargeFee(account, fee) internal](#_chargefee)

### Errors list
- [OnlyFeeBankAccess() ](#onlyfeebankaccess)
- [NotEnoughCredit() ](#notenoughcredit)

### Functions
### constructor

```solidity
constructor(contract IERC20 feeToken, address owner) public
```

### availableCredit

```solidity
function availableCredit(address account) external view returns (uint256)
```
See {IFeeBankCharger-availableCredit}.

### increaseAvailableCredit

```solidity
function increaseAvailableCredit(address account, uint256 amount) external returns (uint256 allowance)
```
See {IFeeBankCharger-increaseAvailableCredit}.

### decreaseAvailableCredit

```solidity
function decreaseAvailableCredit(address account, uint256 amount) external returns (uint256 allowance)
```
See {IFeeBankCharger-decreaseAvailableCredit}.

### _chargeFee

```solidity
function _chargeFee(address account, uint256 fee) internal virtual
```
Internal function that charges a specified fee from a given account's credit allowance.

_Reverts with 'NotEnoughCredit' if the account's credit allowance is insufficient to cover the fee._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| account | address | The address of the account from which the fee is being charged. |
| fee | uint256 | The amount of fee to be charged from the account. |

### Errors
### OnlyFeeBankAccess

```solidity
error OnlyFeeBankAccess()
```

### NotEnoughCredit

```solidity
error NotEnoughCredit()
```

