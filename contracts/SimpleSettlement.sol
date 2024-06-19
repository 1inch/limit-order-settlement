// SPDX-License-Identifier: MIT

pragma solidity 0.8.23;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IOrderMixin } from "@1inch/limit-order-protocol-contract/contracts/interfaces/IOrderMixin.sol";
import { BaseExtension } from "./extensions/BaseExtension.sol";
import { IntegratorFeeExtension } from "./extensions/IntegratorFeeExtension.sol";
import { ResolverValidationExtension } from "./extensions/ResolverValidationExtension.sol";

/**
 * @title Simple Settlement contract
 * @notice Contract to execute limit orders settlement, created by Fusion mode.
 */
contract SimpleSettlement is ResolverValidationExtension, IntegratorFeeExtension {
    /**
     * @notice Initializes the contract.
     * @param limitOrderProtocol The limit order protocol contract.
     * @param feeToken The token to charge protocol fees in.
     * @param accessToken Contract address whose tokens allow filling limit orders with a fee for resolvers that are outside the whitelist.
     * @param weth The WETH address.
     * @param owner The owner of the contract.
     */
    constructor(address limitOrderProtocol, IERC20 feeToken, IERC20 accessToken, address weth, address owner)
        BaseExtension(limitOrderProtocol)
        ResolverValidationExtension(feeToken, accessToken, owner)
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
    ) internal virtual override(ResolverValidationExtension, IntegratorFeeExtension) {
        super._postInteraction(order, extension, orderHash, taker, makingAmount, takingAmount, remainingMakingAmount, extraData);
    }
}
