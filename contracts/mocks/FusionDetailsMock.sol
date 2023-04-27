// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@1inch/solidity-utils/contracts/libraries/AddressLib.sol";

import "../libraries/FusionDetails.sol";

contract FusionDetailsMock {
    using AddressLib for Address;
    using FusionDetails for bytes;

    function parse(bytes calldata details, address resolver, bytes calldata whitelist) external view returns(
        uint256 detailsLength,
        address takingFeeReceiver,
        uint256 takingFeeAmount,
        uint256 bump,
        uint256 resolverFee,
        bool isValidResolver
    ) {
        detailsLength = details.detailsLength();
        takingFeeReceiver = details.takingFeeData().get();
        takingFeeAmount = details.takingFeeData().getUint32(160);
        bump = details.rateBump();
        resolverFee = details.resolverFee();
        isValidResolver = details.checkResolver(resolver, whitelist);
    }
}
