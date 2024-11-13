
## FeeBank

FeeBank contract introduces a credit system for paying fees.
A user can deposit tokens to the FeeBank contract, obtain credits and then use them to pay fees.

_FeeBank is coupled with FeeBankCharger to actually charge fees._

### Functions list
- [constructor(charger, feeToken, owner) public](#constructor)
- [availableCredit(account) external](#availablecredit)
- [deposit(amount) external](#deposit)
- [depositFor(account, amount) external](#depositfor)
- [depositWithPermit(amount, permit) external](#depositwithpermit)
- [depositForWithPermit(account, amount, permit) public](#depositforwithpermit)
- [withdraw(amount) external](#withdraw)
- [withdrawTo(account, amount) external](#withdrawto)
- [gatherFees(accounts) external](#gatherfees)
- [_depositFor(account, amount) internal](#_depositfor)
- [_withdrawTo(account, amount) internal](#_withdrawto)
- [rescueFunds(token, amount) external](#rescuefunds)

### Errors list
- [ZeroAddress() ](#zeroaddress)

### Functions
### constructor

```solidity
constructor(contract IFeeBankCharger charger, contract IERC20 feeToken, address owner) public
```

### availableCredit

```solidity
function availableCredit(address account) external view returns (uint256)
```
See {IFeeBank-availableCredit}.

### deposit

```solidity
function deposit(uint256 amount) external returns (uint256)
```
See {IFeeBank-deposit}.

### depositFor

```solidity
function depositFor(address account, uint256 amount) external returns (uint256)
```
See {IFeeBank-depositFor}.

### depositWithPermit

```solidity
function depositWithPermit(uint256 amount, bytes permit) external returns (uint256)
```
See {IFeeBank-depositWithPermit}.

### depositForWithPermit

```solidity
function depositForWithPermit(address account, uint256 amount, bytes permit) public returns (uint256)
```
See {IFeeBank-depositForWithPermit}.

### withdraw

```solidity
function withdraw(uint256 amount) external returns (uint256)
```
See {IFeeBank-withdraw}.

### withdrawTo

```solidity
function withdrawTo(address account, uint256 amount) external returns (uint256)
```
See {IFeeBank-withdrawTo}.

### gatherFees

```solidity
function gatherFees(address[] accounts) external returns (uint256 totalAccountFees)
```
Admin method returns commissions spent by users.

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| accounts | address[] | Accounts whose commissions are being withdrawn. |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
totalAccountFees | uint256 | The total amount of accounts commissions. |

### _depositFor

```solidity
function _depositFor(address account, uint256 amount) internal returns (uint256 totalAvailableCredit)
```

### _withdrawTo

```solidity
function _withdrawTo(address account, uint256 amount) internal returns (uint256 totalAvailableCredit)
```

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
### ZeroAddress

```solidity
error ZeroAddress()
```

