// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import "@1inch/solidity-utils/contracts/libraries/UniERC20.sol";
import "@1inch/solidity-utils/contracts/libraries/AddressSet.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IStaking.sol";
import "./interfaces/IWhitelistRegistry.sol";

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
    IStaking public immutable staking;

    constructor(
        IStaking staking_,
        uint256 threshold,
        uint256 maxWhitelisted_
    ) {
        staking = staking_;
        resolverThreshold = threshold;
        maxWhitelisted = maxWhitelisted_;
    }

    function rescueFunds(IERC20 token, uint256 amount) external onlyOwner {
        token.uniTransfer(payable(msg.sender), amount);
    }

    function setResolverThreshold(uint256 threshold) external onlyOwner {
        resolverThreshold = threshold;
        emit SetResolverThreshold(threshold);
    }

    function register() external {
        uint256 staked = staking.balanceOf(msg.sender);
        if (staked < resolverThreshold) revert BalanceLessThanThreshold();
        uint256 whitelistLength = _whitelist.length();
        if (whitelistLength < maxWhitelisted) {
            _whitelist.add(msg.sender);
            return;
        }
        address minResolver = msg.sender;
        uint256 minStaked = staked;
        for (uint256 i = 0; i < whitelistLength; ++i) {
            address curWhitelisted = _whitelist.at(i);
            staked = staking.balanceOf(curWhitelisted);
            if (staked < minStaked) {
                minResolver = curWhitelisted;
                minStaked = staked;
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
                if (staking.balanceOf(curWhitelisted) < resolverThreshold) {
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
            _excludePoorest(_whitelist, staking, whitelistLength - size);
        }
        maxWhitelisted = size;
    }

    function _excludePoorest(AddressSet.Data storage set, IStaking token, uint256 amount) private {
        address[] memory excluded = new address[](amount);
        uint256[] memory excludedStaked = new uint256[](amount);

        address[] memory addresses = set.items.get();
        for (uint256 i = 0; i < addresses.length; i++) {
            address curAddress = addresses[i];
            uint256 staked = token.balanceOf(curAddress);
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
