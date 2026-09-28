// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {CreditModule} from "./modules/CreditModule.sol";
import {Params} from "./types/CreditTypes.sol";

/// @title MatoCreditLine
/// @notice An interest-free credit line in AUSD whose limit grows with the
///         borrower's repayment record. Deployed behind an ERC1967 proxy and
///         upgraded through UUPS by the admin.
///
/// @dev Built from modules, each with its own ERC-7201 storage namespace so a
///      module can change in an upgrade without shifting another's slots:
///
///      Governed          roles, pause, parameters, upgrade authorisation
///      PoolModule        lenders' ERC4626 pool over AUSD
///      IdentityModule    one verified identity per wallet
///      CollateralModule  yield-vault shares, card hold, yield fee
///      CreditModule      draw, repay, default, score and limit views
///
///      Collateral and debt are both AUSD, so no price feed is involved. Every
///      figure behind a limit is readable on chain and recomputable by hand.
contract MatoCreditLine is CreditModule {
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(IERC20 ausd, IERC4626 vault, address admin, Params calldata p)
        external
        initializer
    {
        __Governed_init(admin, p);
        __PoolModule_init(ausd, vault);
    }
}
