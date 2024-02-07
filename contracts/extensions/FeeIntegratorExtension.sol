// SPDX-License-Identifier: MIT

pragma solidity 0.8.23;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IOrderMixin } from "@1inch/limit-order-protocol-contract/contracts/interfaces/IOrderMixin.sol";
import { SafeERC20 } from "@1inch/solidity-utils/contracts/libraries/SafeERC20.sol";
import { Address, AddressLib } from "@1inch/solidity-utils/contracts/libraries/AddressLib.sol";
import { ExtensionBase } from "../ExtensionBase.sol";

abstract contract FeeIntegratorExtension is ExtensionBase {
    using SafeERC20 for IERC20;
    using AddressLib for Address;

    uint256 private constant _TAKING_FEE_BASE = 1e9;

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
        if (extraData[extraData.length - 1] & 0x02 == 0x02) {
            address integrator = address(bytes20(extraData[:20]));
            uint256 integrationFee = takingAmount * uint256(uint32(bytes4(extraData[20:24]))) / _TAKING_FEE_BASE;
            if (integrationFee > 0) {
                IERC20(order.takerAsset.get()).safeTransferFrom(taker, integrator, integrationFee);
            }
            extraData = extraData[24:];
        }
        super._postInteraction(order, extension, orderHash, taker, makingAmount, takingAmount, remainingMakingAmount, extraData);
    }
}
