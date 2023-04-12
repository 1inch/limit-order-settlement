// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import "@1inch/solidity-utils/contracts/libraries/UniERC20.sol";
import "@1inch/solidity-utils/contracts/libraries/AddressSet.sol";
import "@1inch/st1inch/contracts/interfaces/IVotable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title Contract with trades resolvers whitelist
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

    event Registered(address addr);
    event Unregistered(address addr);
    event ResolverThresholdSet(uint256 resolverThreshold);
    event WhitelistLimitSet(uint256 whitelistLimit);
    event WhitelistLimitDecreaseRequest(uint256 whitelistLimit);
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

    function rescueFunds(IERC20 token_, uint256 amount) external onlyOwner {
        token_.uniTransfer(payable(msg.sender), amount);
    }

    function setResolverThreshold(uint256 resolverThreshold_) external onlyOwner {
        _setResolverThreshold(resolverThreshold_);
    }

    function setWhitelistLimit(uint256 whitelistLimit_) external onlyOwner {
        if (whitelistLimit == whitelistLimit_) revert SameWhitelistSize();
        whitelistLimitNew = whitelistLimit_;
        if (whitelistLimit_ > _whitelist.length()) {
            _setWhitelistLimit(whitelistLimit_);
        } else {
            emit WhitelistLimitDecreaseRequest(whitelistLimit_);
        }
    }

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

    function promote(uint256 chainId, address promotee) external {
        if (promotions[msg.sender][chainId] == promotee) revert SamePromotee();
        promotions[msg.sender][chainId] = promotee;
        emit Promotion(msg.sender, chainId, promotee);
    }

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

    function getWhitelist() external view returns (address[] memory) {
        return _whitelist.items.get();
    }

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
