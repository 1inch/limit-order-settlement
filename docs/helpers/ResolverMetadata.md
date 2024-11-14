
## ResolverMetadata

Stores resolvers link to their metadata, which is displayed in 1inch dapp.

### Functions list
- [constructor(delegation_) public](#constructor)
- [setResolverUrl(url) external](#setresolverurl)

### Errors list
- [NotRegisteredDelegatee() ](#notregistereddelegatee)

### Functions
### constructor

```solidity
constructor(contract ITokenizedDelegationPlugin delegation_) public
```

### setResolverUrl

```solidity
function setResolverUrl(string url) external
```
Sets the resolver's URL pointing to the metadata.

_Only resolver registered for delegation can call this function._

#### Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |
| url | string | The resolver URL to be set for the resolver. |

### Errors
### NotRegisteredDelegatee

```solidity
error NotRegisteredDelegatee()
```

_Emitted when an unregistered resolver tries to perform a restricted operation._

