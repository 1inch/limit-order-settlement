// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import "@1inch/solidity-utils/contracts/libraries/UniERC20.sol";
import "@1inch/solidity-utils/contracts/libraries/AddressSet.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./helpers/VotingPowerCalculator.sol";
import "./interfaces/IRewardableToken.sol";
import "./interfaces/IWhitelistRegistry.sol";

/// @title Contract with trades resolvers whitelist
contract WhitelistRegistry is IWhitelistRegistry, Ownable, VotingPowerCalculator {
    using UniERC20 for IERC20;
    using AddressSet for AddressSet.Data;

    error BalanceLessThanThreshold();
    error NotEnoughBalance();

    event Registered(address addr);
    event SetResolverThreshold(uint256 threshold);

    uint256 public constant MAX_WHITELISTED = 10;

    AddressSet.Data private _whitelist;

    uint256 public resolverThreshold;
    IRewardableToken public immutable rewardToken;

    constructor(IRewardableToken rewardToken_, VotingPowerCalculator st1inch_, uint256 threshold) VotingPowerCalculator(st1inch_.expBase(), st1inch_.origin()) {
        rewardToken = rewardToken_;
        resolverThreshold = threshold;
    }

    function rescueFunds(IERC20 token, uint256 amount) external onlyOwner {
        token.uniTransfer(payable(msg.sender), amount);
    }

    function setResolverThreshold(uint256 threshold) external onlyOwner {
        resolverThreshold = threshold;
        emit SetResolverThreshold(threshold);
    }

    function register() external {
        if (votingPowerOf(rewardToken.balanceOf(msg.sender)) < resolverThreshold) revert BalanceLessThanThreshold();
        uint256 whitelistLength = _whitelist.length();
        if (whitelistLength < MAX_WHITELISTED) {
            _whitelist.add(msg.sender);
            return;
        }
        address minResolver = msg.sender;
        uint256 minReward = rewardToken.balanceOf(msg.sender);
        for (uint256 i = 0; i < whitelistLength; ++i) {
            address curWhitelisted = _whitelist.at(i);
            uint256 reward = rewardToken.balanceOf(curWhitelisted);
            if (reward < minReward) {
                minResolver = curWhitelisted;
                minReward = reward;
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
            for(uint256 i = 0; i < whitelistLength;) {
                address curWhitelisted = _whitelist.at(i);
                if (votingPowerOf(rewardToken.balanceOf(curWhitelisted)) < resolverThreshold) {
                    _whitelist.remove(curWhitelisted);
                    whitelistLength--;
                } else {
                    i++;
                }
            }
        }
    }
}
