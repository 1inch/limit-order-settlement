// SPDX-License-Identifier: MIT

pragma solidity 0.8.23;

import { IOrderMixin } from "@1inch/limit-order-protocol-contract/contracts/interfaces/IOrderMixin.sol";
import { IPostInteraction } from "@1inch/limit-order-protocol-contract/contracts/interfaces/IPostInteraction.sol";
import { PostInteractionController } from "@1inch/limit-order-protocol-contract/contracts/helpers/PostInteractionController.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title Custom Interaction Extension
 * @notice Abstract contract designed to integrate custom post-interaction method. Should be last executed in the inheritance chain.
 */
abstract contract CustomInteractionExtension is PostInteractionController, Ownable {
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
        // Allows to add custom postInteractions
        if (extraData.length > 20) {
            IPostInteraction(address(bytes20(extraData))).postInteraction(order, extension, orderHash, taker, makingAmount, takingAmount, remainingMakingAmount, extraData[20:extraData.length - 1]);
        }
    }
}
