// SPDX-License-Identifier: MIT

pragma solidity 0.8.15;

import "@1inch/solidity-utils/contracts/libraries/UniERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IWhitelistRegistry.sol";

/// @title Contract with simple whitelist
contract WhitelistRegistrySimple is IWhitelistRegistry, Ownable {
    using UniERC20 for IERC20;

    error ArraysLengthsDoNotMatch();
    error SameStatus();

    event StatusUpdate(address indexed addr, uint256 status);

    mapping(address => uint256) public status;

    function batchSetStatus(address[] calldata addresses, uint256[] calldata statuses) external onlyOwner {
        uint256 length = addresses.length;
        if (length != statuses.length) revert ArraysLengthsDoNotMatch();
        for (uint256 i = 0; i < length; ++i) {
            _setStatus(addresses[i], statuses[i]);
        }
    }

    function setStatus(address _address, uint256 _status) external onlyOwner {
        _setStatus(_address, _status);
    }

    function _setStatus(address _address, uint256 _status) private {
        if (status[_address] == _status) revert SameStatus();
        status[_address] = _status;
        emit StatusUpdate(_address, _status);
    }

    function rescueFunds(IERC20 token, uint256 amount) external onlyOwner {
        token.uniTransfer(payable(msg.sender), amount);
    }
}
