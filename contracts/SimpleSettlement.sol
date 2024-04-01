// SPDX-License-Identifier: MIT

pragma solidity 0.8.23;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IOrderMixin } from "@1inch/limit-order-protocol-contract/contracts/interfaces/IOrderMixin.sol";
import { BaseExtension } from "./extensions/BaseExtension.sol";
import { IntegratorFeeExtension } from "./extensions/IntegratorFeeExtension.sol";
import { ResolverFeeExtension } from "./extensions/ResolverFeeExtension.sol";
import { WhitelistExtension } from "./extensions/WhitelistExtension.sol";

/**
 * @title Simple Settlement contract
 * @notice Contract to execute limit orders settlement, created by Fusion mode.
 */
contract SimpleSettlement is WhitelistExtension, ResolverFeeExtension, IntegratorFeeExtension {
    /**
     * @notice Initializes the contract.
     * @param limitOrderProtocol The limit order protocol contract.
     * @param feeToken The token to charge protocol fees in.
     * @param weth The WETH address.
     */
    constructor(address limitOrderProtocol, IERC20 feeToken, address weth, address owner)
        BaseExtension(limitOrderProtocol)
        ResolverFeeExtension(feeToken)
        IntegratorFeeExtension(weth)
        Ownable(owner)
    {}

    function _postInteraction(
        IOrderMixin.Order calldata order,
        bytes calldata extension,
        bytes32 orderHash,
        address taker,
        uint256 makingAmount,
        uint256 takingAmount,
        uint256 remainingMakingAmount,
        bytes calldata extraData
    ) internal virtual override(WhitelistExtension, ResolverFeeExtension, IntegratorFeeExtension) {
        super._postInteraction(order, extension, orderHash, taker, makingAmount, takingAmount, remainingMakingAmount, extraData);
    }
}
