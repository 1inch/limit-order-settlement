// SPDX-License-Identifier: MIT

pragma solidity 0.8.15;

import "@1inch/solidity-utils/contracts/libraries/UniERC20.sol";
import "@1inch/solidity-utils/contracts/libraries/AddressSet.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IStaking.sol";
import "./interfaces/IWhitelistRegistry.sol";

/// @title Contract with trades resolvers whitelist
contract WhitelistRegistry is IWhitelistRegistry, Ownable {
    using UniERC20 for IERC20;
    using AddressSet for AddressSet.Data;

    error BalanceLessThanThreshold();
    error NotEnoughBalance();

    event Registered(address addr);
    event SetResolverThreshold(uint256 threshold);
    event SetStaking(IStaking stakingContract);

    uint256 public constant MAX_WHITELISTED = 10;

    AddressSet.Data private _whitelist;

    uint256 public resolverThreshold;
    IStaking public staking;

    constructor(IStaking staking_, uint256 threshold) {
        staking = staking_;
        resolverThreshold = threshold;
    }

    function rescueFunds(IERC20 token, uint256 amount) external onlyOwner {
        token.uniTransfer(payable(msg.sender), amount);
    }

    function setResolverThreshold(uint256 threshold) external onlyOwner {
        resolverThreshold = threshold;
        emit SetResolverThreshold(threshold);
    }

    function setStaking(IStaking staking_) external onlyOwner {
        staking = staking_;
        emit SetStaking(staking_);
    }

    function register() external {
        uint256 staked = staking.balanceOf(_msgSender());
        if (staked < resolverThreshold) revert BalanceLessThanThreshold();
        uint256 whitelistLength = _whitelist.length();
        if (whitelistLength < MAX_WHITELISTED) {
            _whitelist.add(_msgSender());
            return;
        }
        address minResolver = _msgSender();
        uint256 minStaked = staked;
        for (uint256 i = 0; i < whitelistLength; ++i) {
            address curWhitelisted = _whitelist.at(i);
            staked = staking.balanceOf(curWhitelisted);
            if (staked < minStaked) {
                minResolver = curWhitelisted;
                minStaked = staked;
            }
        }
        if (minResolver == _msgSender()) revert NotEnoughBalance();
        _whitelist.remove(minResolver);
        _whitelist.add(_msgSender());
        emit Registered(_msgSender());
    }

    function status(address addr) external view returns (bool) {
        return _whitelist.contains(addr);
    }
}
