// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import "@1inch/solidity-utils/contracts/libraries/UniERC20.sol";
import "@1inch/solidity-utils/contracts/libraries/AddressSet.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IWhitelistRegistry.sol";
import "./interfaces/IVotable.sol";
import "./helpers/VotingPowerCalculator.sol";

/// @title Contract with trades resolvers whitelist
contract WhitelistRegistry is IWhitelistRegistry, Ownable {
    using UniERC20 for IERC20;
    using AddressSet for AddressSet.Data;
    using AddressArray for AddressArray.Data;

    error BalanceLessThanThreshold();
    error NotEnoughBalance();
    error AlreadyRegistered();
    error NotWhitelisted();
    error ZeroPromoteeAddress();

    event Registered(address addr);
    event Unregistered(address addr);
    event ResolverThresholdSet(uint256 resolverThreshold);
    event SetWhitelistLimit(uint256 whitelistLimit);
    event Promotion(address promoter, address promotee);

    IVotable public immutable token;

    mapping(address => address) public promotion;
    uint256 public resolverThreshold;
    uint256 public whitelistLimit;

    AddressSet.Data private _whitelist;
    mapping(address => uint256) private _promotingsCount;

    constructor(
        IVotable token_,
        uint256 resolverThreshold_,
        uint256 whitelistLimit_
    ) {
        token = token_;
        _setResolverThreshold(resolverThreshold_);
        _setWhitelistLimit(whitelistLimit_);
    }

    function rescueFunds(IERC20 token_, uint256 amount) external onlyOwner {
        token_.uniTransfer(payable(msg.sender), amount);
    }

    function setResolverThreshold(uint256 resolverThreshold_) external onlyOwner {
        _setResolverThreshold(resolverThreshold_);
    }

    function setWhitelistLimit(uint256 whitelistLimit_) external onlyOwner {
        uint256 whitelistLength = _whitelist.length();
        if (whitelistLimit_ < whitelistLength) {
            _shrinkPoorest(_whitelist, whitelistLength - whitelistLimit_);
        }
        _setWhitelistLimit(whitelistLimit_);
    }

    function register() external {
        registerAndPromote(msg.sender);
    }

    function registerAndPromote(address promotee) public {
        if (token.votingPowerOf(msg.sender) < resolverThreshold) revert BalanceLessThanThreshold();
        uint256 whitelistLength = _whitelist.length();
        if (whitelistLength == whitelistLimit) {
            address minResolver = msg.sender;
            uint256 minBalance = token.balanceOf(msg.sender);
            for (uint256 i = 0; i < whitelistLength; ++i) {
                address curWhitelisted = _whitelist.at(i);
                uint256 balance = token.balanceOf(curWhitelisted);
                if (balance < minBalance) {
                    minResolver = curWhitelisted;
                    minBalance = balance;
                }
            }
            if (minResolver == msg.sender) revert NotEnoughBalance();
            _removeFromWhitelist(minResolver);
        }
        _addToWhitelist(msg.sender, promotee);
    }

    function promote(address promotee) external {
        if (promotee == address(0)) revert ZeroPromoteeAddress();
        if (!_whitelist.contains(msg.sender)) revert NotWhitelisted();

        address oldPromotee = promotion[msg.sender];
        promotion[msg.sender] = promotee;
        unchecked {
            _promotingsCount[oldPromotee]--;
            _promotingsCount[promotee]++;
        }
        emit Promotion(msg.sender, promotee);
    }

    function isWhitelisted(address addr) external view returns (bool) {
        return _promotingsCount[addr] > 0;
    }

    function clean() external {
        uint256 whitelistLength = _whitelist.length();
        unchecked {
            for (uint256 i = 0; i < whitelistLength; ) {
                address curWhitelisted = _whitelist.at(i);
                if (token.votingPowerOf(curWhitelisted) < resolverThreshold) {
                    _removeFromWhitelist(curWhitelisted);
                    whitelistLength--;
                } else {
                    i++;
                }
            }
        }
    }

    function getWhitelist() public view returns (address[] memory) {
        return _whitelist.items.get();
    }

    function _shrinkPoorest(AddressSet.Data storage set, uint256 size) private {
        uint256 richestIndex = 0;
        address[] memory addresses = set.items.get();
        uint256 addressesLength = addresses.length;
        uint256[] memory balances = new uint256[](addressesLength);
        for (uint256 i = 0; i < addressesLength; i++) {
            balances[i] = token.balanceOf(addresses[i]);
            if (balances[i] > balances[richestIndex]) {
                richestIndex = i;
            }
        }

        for (uint256 i = size; i < addressesLength; i++) {
            if (balances[i] <= balances[richestIndex]) {
                // Swap i-th and richest-th elements
                (addresses[i], addresses[richestIndex]) = (addresses[richestIndex], addresses[i]);
                (balances[i], balances[richestIndex]) = (balances[richestIndex], balances[i]);

                // Find new richest in first size elements
                richestIndex = 0;
                for (uint256 j = 1; j < size; j++) {
                    if (balances[j] > balances[richestIndex]) {
                        richestIndex = j;
                    }
                }
            }
        }

        // Remove poorest elements from set
        for (uint256 i = 0; i < size; i++) {
            _removeFromWhitelist(addresses[i]);
        }
    }

    function _setResolverThreshold(uint256 resolverThreshold_) private {
        resolverThreshold = resolverThreshold_;
        emit ResolverThresholdSet(resolverThreshold_);
    }

    function _setWhitelistLimit(uint256 whitelistLimit_) private {
        whitelistLimit = whitelistLimit_;
        emit SetWhitelistLimit(whitelistLimit_);
    }

    function _addToWhitelist(address account, address promotee) private {
        if (!_whitelist.add(account)) revert AlreadyRegistered();
        emit Registered(account);

        promotion[account] = promotee;
        unchecked {
            _promotingsCount[promotee]++;
        }
        emit Promotion(account, promotee);
    }

    function _removeFromWhitelist(address account) private {
        _whitelist.remove(account);
        emit Unregistered(account);

        unchecked {
            _promotingsCount[promotion[account]]--;
        }
        promotion[account] = address(0);
        emit Promotion(account, address(0));
    }
}
