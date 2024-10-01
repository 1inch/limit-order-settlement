// SPDX-License-Identifier: MIT

pragma solidity 0.8.23;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IOrderMixin } from "@1inch/limit-order-protocol-contract/contracts/interfaces/IOrderMixin.sol";
import { SimpleExtension } from "@1inch/limit-order-protocol-contract/contracts/extensions/SimpleExtension.sol";
import { IPostInteraction } from "@1inch/limit-order-protocol-contract/contracts/interfaces/IPostInteraction.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { UniERC20 } from "@1inch/solidity-utils/contracts/libraries/UniERC20.sol";
import "hardhat/console.sol";

/**
 * @title Custom Interaction Extension
 * @notice Abstract contract designed to integrate custom post-interaction method. Should be last executed in the inheritance chain.
 */
abstract contract CustomInteractionExtension is SimpleExtension, Ownable {
    using UniERC20 for IERC20;

    function _postInteraction(
        IOrderMixin.Order calldata order,
        bytes calldata extension,
        bytes32 orderHash,
        address taker,
        uint256 makingAmount,
        uint256 takingAmount,
        uint256 remainingMakingAmount,
        bytes calldata extraData
    ) internal virtual override {
        console.log("CustomInteractionExtension._postInteraction");
        // Allows to add custom postInteractions
        if (extraData.length > 20) {
            IPostInteraction(address(bytes20(extraData))).postInteraction(order, extension, orderHash, taker, makingAmount, takingAmount, remainingMakingAmount, extraData[20 : extraData.length - 1]);
        }
    }
}
