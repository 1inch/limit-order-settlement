// SPDX-License-Identifier: MIT

pragma solidity 0.8.23;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IOrderMixin } from "@1inch/limit-order-protocol-contract/contracts/interfaces/IOrderMixin.sol";
import { SafeERC20 } from "@1inch/solidity-utils/contracts/libraries/SafeERC20.sol";
import { Address, AddressLib } from "@1inch/solidity-utils/contracts/libraries/AddressLib.sol";
import { BaseExtension } from "./BaseExtension.sol";
import { ExtensionLib } from "./ExtensionLib.sol";

/**
 * @title Integrator Fee Extension
 * @notice Abstract contract designed to integrate fee processing within the post-interaction phase of order execution.
 */
abstract contract IntegratorFeeExtension is BaseExtension {
    using SafeERC20 for IERC20;
    using AddressLib for Address;
    using ExtensionLib for bytes;

    uint256 private constant _TAKING_FEE_BASE = 1e9;

    /**
     * @param extraData Structured data of length n bytes, segmented as follows:
     * [0:20]  - Integrator address.
     * [20:24] - Integration fee information.
     * [24:n]  - ExtraData for other extensions, not utilized by this integration fee extension.
     * [n] - Bitmap indicating usage flags, where `xxxx xx1x` signifies integration fee usage. Other bits in this bitmap are not used by this extension.
     */
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
        if (extraData.integratorFeeEnabled()) {
            address integrator = address(bytes20(extraData[:20]));
            uint256 fee = takingAmount * uint256(uint32(bytes4(extraData[20:24]))) / _TAKING_FEE_BASE;
            if (fee > 0) {
                IERC20(order.takerAsset.get()).safeTransferFrom(taker, integrator, fee);
            }
            extraData = extraData[24:];
        }
        super._postInteraction(order, extension, orderHash, taker, makingAmount, takingAmount, remainingMakingAmount, extraData);
    }
}
