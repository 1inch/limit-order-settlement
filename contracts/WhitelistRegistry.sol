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

    event Registered(address addr);
    event SetResolverThreshold(uint256 threshold);

    AddressSet.Data private _whitelist;

    uint256 public maxWhitelisted;
    uint256 public resolverThreshold;
    IVotable public immutable token;

    constructor(
        IVotable token_,
        uint256 resolverThreshold_,
        uint256 maxWhitelisted_
    ) {
        token = token_;
        resolverThreshold = resolverThreshold_;
        maxWhitelisted = maxWhitelisted_;
    }

    function rescueFunds(IERC20 token_, uint256 amount) external onlyOwner {
        token_.uniTransfer(payable(msg.sender), amount);
    }

    function setResolverThreshold(uint256 threshold) external onlyOwner {
        resolverThreshold = threshold;
        emit SetResolverThreshold(threshold);
    }

    function register() external {
        if (token.votingPowerOf(msg.sender) < resolverThreshold) revert BalanceLessThanThreshold();
        uint256 whitelistLength = _whitelist.length();
        if (whitelistLength < maxWhitelisted) {
            _whitelist.add(msg.sender);
            return;
        }
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
        _whitelist.remove(minResolver);
        _whitelist.add(msg.sender);
        emit Registered(msg.sender);
    }

    function isWhitelisted(address addr) external view returns (bool) {
        return _whitelist.contains(addr);
    }

    function clean() external {
        uint256 whitelistLength = _whitelist.length();
        unchecked {
            for (uint256 i = 0; i < whitelistLength; ) {
                address curWhitelisted = _whitelist.at(i);
                if (token.votingPowerOf(curWhitelisted) < resolverThreshold) {
                    _whitelist.remove(curWhitelisted);
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

    function setMaxWhitelisted(uint256 size) external onlyOwner {
        uint256 whitelistLength = _whitelist.length();
        if (size < whitelistLength) {
            _shrinkPoorest(_whitelist, token, whitelistLength - size);
        }
        maxWhitelisted = size;
    }

    function _shrinkPoorest(AddressSet.Data storage set, IVotable vtoken, uint256 size) private {
        uint256 richestIndex = 0;
        address[] memory addresses = set.items.get();
        uint256[] memory balances = new uint256[](addresses.length);
        for (uint256 i = 0; i < addresses.length; i++) {
            balances[i] = vtoken.balanceOf(addresses[i]);
            if (balances[i] > balances[richestIndex]) {
                richestIndex = i;
            }
        }

        for (uint256 i = size; i < addresses.length; i++) {
            if (balances[i] <= balances[richestIndex]) {
                // Swap i-th and richest-th elements
                (addresses[i], addresses[richestIndex]) = (addresses[richestIndex], addresses[i]);
                (balances[i], balances[richestIndex]) = (balances[richestIndex], balances[i]);

                // Find new richest in first size elements
                if (i < addresses.length) {
                    richestIndex = 0;
                    for (uint256 j = 1; j < size; j++) {
                        if (balances[j] > balances[richestIndex]) {
                            richestIndex = j;
                        }
                    }
                }
            }
        }

        // Remove poorest elements from set
        for (uint256 i = 0; i < size; i++) {
            set.remove(addresses[i]);
        }
    }
}
