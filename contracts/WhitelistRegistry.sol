// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import "@1inch/solidity-utils/contracts/libraries/UniERC20.sol";
import "@1inch/solidity-utils/contracts/libraries/AddressSet.sol";
import "@1inch/st1inch/contracts/interfaces/IVotable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title WhitelistRegistry
 * @notice The contract manages a whitelist for trading resolvers, providing functions to register, 
 * promote and remove addresses, as well as setting various thresholds and limits. It also includes an 
 * emergency rescue function for tokens sent to the contract accidentally.
 */
contract WhitelistRegistry is Ownable {
    using UniERC20 for IERC20;
    using AddressSet for AddressSet.Data;
    using AddressArray for AddressArray.Data;

    error BalanceLessThanThreshold();
    error NotEnoughBalance();
    error AlreadyRegistered();
    error NotWhitelisted();
    error WrongPartition();
    error SameWhitelistSize();
    error SamePromotee();

    /// @notice Emitted after a new resolver is registered.
    event Registered(address addr);
    /// @notice Emitted when a resolver is pushed out of whitelist.
    event Unregistered(address addr);
    /// @notice Emitted when the new minimum voting power to get into the whitelist is set.
    event ResolverThresholdSet(uint256 resolverThreshold);
    /// @notice Emitted when the maximum number of resolvers in the whitelist is set.
    event WhitelistLimitSet(uint256 whitelistLimit);
    /// @notice Emitted when the maximum number of resolvers on the whitelist limit decreased.
    event WhitelistLimitDecreaseRequest(uint256 whitelistLimit);
    /// @notice Emitted when a new worker for a resolver is set.
    event Promotion(address promoter, uint256 chainId, address promotee);

    IVotable public immutable token;

    mapping(address => mapping(uint256 => address)) public promotions;
    uint256 public resolverThreshold;
    uint256 public whitelistLimit;
    uint256 public whitelistLimitNew;

    AddressSet.Data private _whitelist;

    constructor(
        IVotable token_,
        uint256 resolverThreshold_,
        uint256 whitelistLimit_
    ) {
        token = token_;
        _setResolverThreshold(resolverThreshold_);
        _setWhitelistLimit(whitelistLimit_);
        whitelistLimitNew = whitelistLimit_;
    }

    /**
     * @notice Allows the contract owner to recover any tokens accidentally sent to the contract.
     * @param token_ The token to recover.
     * @param amount The amount of tokens to recover.
     */
    function rescueFunds(IERC20 token_, uint256 amount) external onlyOwner {
        token_.uniTransfer(payable(msg.sender), amount);
    }

    /**
     * @notice Allows the contract owner to set a new resolver threshold. The resovler threshold is the minimum voting power required to get into the whitelist.
     * @param resolverThreshold_ The new resolver threshold.
     */
    function setResolverThreshold(uint256 resolverThreshold_) external onlyOwner {
        _setResolverThreshold(resolverThreshold_);
    }

    /**
     * @notice Allows the contract owner to set a new whitelist limit.
     * The whitelist limit is the maximum number of resolvers allowed in the whitelist.
     * @dev The limit could be increased or decreased. If the limit is decreased, resolvers out-of-limit
     * will not be removed from the whitelist, until a new resolver registers or the /shrinkWhitelist/ function is called.
     * @param whitelistLimit_ The new whitelist limit.
     */
    function setWhitelistLimit(uint256 whitelistLimit_) external onlyOwner {
        if (whitelistLimit == whitelistLimit_) revert SameWhitelistSize();
        whitelistLimitNew = whitelistLimit_;
        if (whitelistLimit_ > _whitelist.length()) {
            _setWhitelistLimit(whitelistLimit_);
        } else {
            emit WhitelistLimitDecreaseRequest(whitelistLimit_);
        }
    }

    /**
     * @notice Removes all resolvers from the whitelist that fall below the specified voting power.
     * @param partition The minimum voting power required to stay in the whitelist.
     */
    function shrinkWhitelist(uint256 partition) external {
        uint256 whitelistLimit_ = whitelistLimitNew;
        if (whitelistLimit == whitelistLimit_) revert SameWhitelistSize();
        uint256 whitelistLength = _whitelist.length();
        if (whitelistLimit_ < whitelistLength) {
            unchecked {
                for (uint256 i = 0; i < whitelistLength; ) {
                    address curWhitelisted = _whitelist.at(i);
                    if (token.balanceOf(curWhitelisted) <= partition) {
                        _removeFromWhitelist(curWhitelisted);
                        whitelistLength--;
                    } else {
                        i++;
                    }
                }
            }
            if (whitelistLength != whitelistLimit_) revert WrongPartition();
        }
        _setWhitelistLimit(whitelistLimit_);
    }

    /**
     * @notice Attempts to register the caller in the whitelist.
     * @dev Reverts if the caller's voting power is below the resolver threshold or the last resolver in the whitelist.
     */
    function register() external {
        if (token.votingPowerOf(msg.sender) < resolverThreshold) revert BalanceLessThanThreshold();
        uint256 whitelistLength = _whitelist.length();
        if (whitelistLength == whitelistLimit) {
            address minResolver = msg.sender;
            uint256 minBalance = token.balanceOf(msg.sender);
            unchecked {
                for (uint256 i = 0; i < whitelistLength; ++i) {
                    address curWhitelisted = _whitelist.at(i);
                    uint256 balance = token.balanceOf(curWhitelisted);
                    if (balance < minBalance) {
                        minResolver = curWhitelisted;
                        minBalance = balance;
                    }
                }
            }
            if (minResolver == msg.sender) revert NotEnoughBalance();
            _removeFromWhitelist(minResolver);
        }
        if (!_whitelist.add(msg.sender)) revert AlreadyRegistered();
        emit Registered(msg.sender);
    }

    /**
     * @notice Registers a worker for the resolver to settle orders.
     * @param chainId The chain ID where the worker will assigned.
     * @param promotee The worker's address.
     */
    function promote(uint256 chainId, address promotee) external {
        if (promotions[msg.sender][chainId] == promotee) revert SamePromotee();
        promotions[msg.sender][chainId] = promotee;
        emit Promotion(msg.sender, chainId, promotee);
    }

    /**
     * @notice Cleans the whitelist by removing addresses that fall below the resolver threshold.
     */
    function clean() external {
        uint256 resolverThreshold_ = resolverThreshold;
        uint256 whitelistLength = _whitelist.length();
        unchecked {
            for (uint256 i = 0; i < whitelistLength; ) {
                address curWhitelisted = _whitelist.at(i);
                if (token.votingPowerOf(curWhitelisted) < resolverThreshold_) {
                    _removeFromWhitelist(curWhitelisted);
                    whitelistLength--;
                } else {
                    i++;
                }
            }
        }
    }

    /**
     * @notice Returns the addresses in the whitelist.
     * @return /whitelist/ A list of whitelisted addresses.
     */
    function getWhitelist() external view returns (address[] memory /* whitelist */) {
        return _whitelist.items.get();
    }

    /**
     * @notice Returns the worker list for a particular chain ID.
     * @param chainId The chain ID to get the promoted addresses for.
     * @return promotees A list of worker addresses.
     */
    function getPromotees(uint256 chainId) external view returns (address[] memory promotees) {
        promotees = _whitelist.items.get();
        unchecked {
            uint256 len = promotees.length;
            for (uint256 i = 0; i < len; ++i) {
                promotees[i] = promotions[promotees[i]][chainId];
            }
        }
    }

    function _setResolverThreshold(uint256 resolverThreshold_) private {
        resolverThreshold = resolverThreshold_;
        emit ResolverThresholdSet(resolverThreshold_);
    }

    function _setWhitelistLimit(uint256 whitelistLimit_) private {
        whitelistLimit = whitelistLimit_;
        emit WhitelistLimitSet(whitelistLimit_);
    }

    function _removeFromWhitelist(address account) private {
        _whitelist.remove(account);
        emit Unregistered(account);
    }
}
