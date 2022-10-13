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
            _excludePoorest(_whitelist, token, whitelistLength - size);
        }
        maxWhitelisted = size;
    }

    function _excludePoorest(AddressSet.Data storage set, IVotable vtoken, uint256 amount) private {
        address[] memory excluded = new address[](amount);
        uint256[] memory excludedStaked = new uint256[](amount);

        address[] memory addresses = set.items.get();
        for (uint256 i = 0; i < addresses.length; i++) {
            address curAddress = addresses[i];
            uint256 staked = vtoken.balanceOf(curAddress);
            for (uint256 j = 0; j < amount; j++) {
                if (excluded[j] == address(0)) {
                    excluded[j] = curAddress;
                    excludedStaked[j] = staked;
                } else {
                    if (staked <= excludedStaked[j]) {
                        for (uint256 k = amount-1; k >= j+1 ; k--) {
                            excluded[k] = excluded[k-1];
                            excludedStaked[k] = excludedStaked[k-1];
                        }
                        excluded[j] = curAddress;
                        excludedStaked[j] = staked;
                        break;
                    }
                }
            }
        }

        for (uint256 i = 0; i < amount; i++) {
            set.remove(excluded[i]);
        }
    }
}
