// SPDX-License-Identifier: MIT

pragma solidity 0.8.23;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IOrderMixin } from "@1inch/limit-order-protocol-contract/contracts/interfaces/IOrderMixin.sol";
import { MakerTraits, MakerTraitsLib } from "@1inch/limit-order-protocol-contract/contracts/libraries/MakerTraitsLib.sol";
import { SafeERC20 } from "@1inch/solidity-utils/contracts/libraries/SafeERC20.sol";
import { Address, AddressLib } from "@1inch/solidity-utils/contracts/libraries/AddressLib.sol";
import { UniERC20 } from "@1inch/solidity-utils/contracts/libraries/UniERC20.sol";
import { BaseExtension } from "./BaseExtension.sol";
import { ExtensionLib } from "./ExtensionLib.sol";

/**
 * @title Integrator Fee Extension
 * @notice Abstract contract designed to integrate fee processing within the post-interaction phase of order execution.
 */
abstract contract IntegratorFeeExtension is BaseExtension, Ownable {
    using SafeERC20 for IERC20;
    using AddressLib for Address;
    using ExtensionLib for bytes;
    using MakerTraitsLib for MakerTraits;
    using UniERC20 for IERC20;

    /**
     * @dev Eth transfer failed. The target fallback may have reverted.
     */
    error EthTransferFailed();

    /// @dev Allows fees in range [1e-5, 0.65535]
    uint256 private constant _FEE_BASE = 1e5;

    address private immutable _WETH;

    constructor(address weth) {
        _WETH = weth;
    }

    /**
     * @notice Fallback function to receive ETH.
     */
    receive() external payable {}

    /**
     * @param extraData Structured data of length n bytes, segmented as follows:
     * [0:2]   - Fee percentage in basis points.
     * [2:22]  - Integrator address.
     * [22:42] - Custom receiver address.
     * [42:n]  - ExtraData for other extensions, not utilized by this integration fee extension.
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
            uint256 fee = takingAmount * uint256(uint16(bytes2(extraData))) / _FEE_BASE;
            address feeRecipient = address(bytes20(extraData[2:22]));
            extraData = extraData[22:];

            address receiver = order.maker.get();
            if (extraData.hasCustomReceiver()) {
                receiver = address(bytes20(extraData));
                extraData = extraData[20:];
            }

            bool isEth = order.takerAsset.get() == address(_WETH) && order.makerTraits.unwrapWeth();

            if (isEth) {
                if (fee > 0) {
                    _sendEth(feeRecipient, fee);
                }
                unchecked {
                    _sendEth(receiver, takingAmount - fee);
                }
            } else {
                if (fee > 0) {
                    IERC20(order.takerAsset.get()).safeTransfer(feeRecipient, fee);
                }
                unchecked {
                    IERC20(order.takerAsset.get()).safeTransfer(receiver, takingAmount - fee);
                }
            }
        }

        super._postInteraction(order, extension, orderHash, taker, makingAmount, takingAmount, remainingMakingAmount, extraData);
    }

    /**
     * @notice Retrieves funds accidently sent directly to the contract address
     * @param token ERC20 token to retrieve
     * @param amount amount to retrieve
     */
    function rescueFunds(IERC20 token, uint256 amount) external onlyOwner {
        token.uniTransfer(payable(msg.sender), amount);
    }

    function _sendEth(address target, uint256 amount) private {
        (bool success, ) = target.call{value: amount}("");
        if (!success) {
            revert EthTransferFailed();
        }
    }
}
