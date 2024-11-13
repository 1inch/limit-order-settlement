
## ExtensionLib

Library to retrieve data from the bitmap.

### Functions list
- [resolverFeeEnabled(extraData) internal](#resolverfeeenabled)
- [integratorFeeEnabled(extraData) internal](#integratorfeeenabled)
- [hasCustomReceiver(extraData) internal](#hascustomreceiver)
- [resolversCount(extraData) internal](#resolverscount)

### Functions
### resolverFeeEnabled

```solidity
function resolverFeeEnabled(bytes extraData) internal pure returns (bool)
```
Checks if the resolver fee is enabled

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| extraData | bytes | Data to be processed in the extension |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
[0] | bool | True if the resolver fee is enabled |

### integratorFeeEnabled

```solidity
function integratorFeeEnabled(bytes extraData) internal pure returns (bool)
```
Checks if the integrator fee is enabled

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| extraData | bytes | Data to be processed in the extension |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
[0] | bool | True if the integrator fee is enabled |

### hasCustomReceiver

```solidity
function hasCustomReceiver(bytes extraData) internal pure returns (bool)
```
Checks if the custom receiver is enabled

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| extraData | bytes | Data to be processed in the extension |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
[0] | bool | True if the custom receiver is specified |

### resolversCount

```solidity
function resolversCount(bytes extraData) internal pure returns (uint256)
```
Gets the number of resolvers in the whitelist

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| extraData | bytes | Data to be processed in the extension |

#### Return Values

| Name | Type | Description |
| ---- | ---- | ----------- |
[0] | uint256 | The number of resolvers in the whitelist |

