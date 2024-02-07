// SPDX-License-Identifier: MIT

pragma solidity 0.8.23;

import { IOrderMixin } from "@1inch/limit-order-protocol-contract/contracts/interfaces/IOrderMixin.sol";
import { ExtensionBase } from "../ExtensionBase.sol";
import { FeeBankCharger } from "../FeeBankCharger.sol";

/**
 * @title Fee Resolver Extension
 * @notice Abstract contract used as an extension in settlement contract to charge a fee resolver in the `postInteraction` method.
 */
abstract contract FeeResolverExtension is ExtensionBase, FeeBankCharger {
    uint256 private constant _ORDER_FEE_BASE_POINTS = 1e15;

    /**
     * @dev Calculates the resolver fee.
     * @param fee Scaled resolver fee.
     * @param orderMakingAmount Making amount from the order.
     * @param actualMakingAmount Making amount that was actually filled.
     * @return resolverFee Calculated resolver fee.
     */
    function _getResolverFee(
        uint256 fee,
        uint256 orderMakingAmount,
        uint256 actualMakingAmount
    ) internal pure virtual returns(uint256) {
        return fee * _ORDER_FEE_BASE_POINTS * actualMakingAmount / orderMakingAmount;
    }

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
        if (extraData[extraData.length - 1] & 0x01 == 0x01) {
            uint256 resolverFee = _getResolverFee(uint256(uint32(bytes4(extraData[:4]))), order.makingAmount, makingAmount);
            _chargeFee(taker, resolverFee);
            extraData = extraData[4:];
        }
        super._postInteraction(order, extension, orderHash, taker, makingAmount, takingAmount, remainingMakingAmount, extraData);
    }
}
