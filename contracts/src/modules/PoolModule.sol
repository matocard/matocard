// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {
    ERC4626Upgradeable
} from "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC4626Upgradeable.sol";
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";

import {Governed} from "./Governed.sol";

/// @title PoolModule
/// @notice The lenders' side: an ERC4626 pool over AUSD.
/// @dev The pool's assets are AUSD not lent out (`idle`), AUSD lent out
///      (`totalDrawn`), and yield-vault shares it owns (`poolShares`: seized on
///      default or taken as the yield fee). `idle` is tracked, never read from
///      `balanceOf`, so a donation cannot move the share price.
abstract contract PoolModule is Governed, ERC4626Upgradeable, ReentrancyGuardTransient {
    /// @custom:storage-location erc7201:matocard.storage.Pool
    struct PoolStorage {
        IERC4626 yieldVault;
        uint256 idle;
        uint256 totalDrawn;
        uint256 poolShares;
    }

    // keccak256(abi.encode(uint256(keccak256("matocard.storage.Pool")) - 1)) & ~bytes32(uint256(0xff))
    bytes32 private constant POOL_STORAGE =
        0x7860931a17959cc99ed8d78bab040157c8fa1b74f51e6d6d0c32d6f6a648d400;

    function __PoolModule_init(IERC20 ausd, IERC4626 vault) internal onlyInitializing {
        if (vault.asset() != address(ausd)) revert VaultAssetMismatch();
        __ERC20_init("Matocard Pool", "mPOOL");
        __ERC4626_init(ausd);
        _pool().yieldVault = vault;
    }

    function yieldVault() public view returns (IERC4626) {
        return _pool().yieldVault;
    }

    /// @notice AUSD in this contract that belongs to the pool and is not lent out.
    function idle() public view returns (uint256) {
        return _pool().idle;
    }

    function totalDrawn() public view returns (uint256) {
        return _pool().totalDrawn;
    }

    function poolShares() public view returns (uint256) {
        return _pool().poolShares;
    }

    /// @notice Turns pool-owned vault shares into AUSD lenders can withdraw.
    function redeemPoolShares(uint256 shares) external nonReentrant {
        PoolStorage storage $ = _pool();
        if (shares == 0) revert ZeroAmount();
        if (shares > $.poolShares) revert InsufficientCollateral(shares, $.poolShares);
        $.poolShares -= shares;
        uint256 assets = $.yieldVault.redeem(shares, address(this), address(this));
        $.idle += assets;
        emit PoolSharesRedeemed(shares, assets);
    }

    function totalAssets() public view override returns (uint256) {
        PoolStorage storage $ = _pool();
        return $.idle + $.totalDrawn + $.yieldVault.convertToAssets($.poolShares);
    }

    /// @notice Lenders cannot take out AUSD that is lent to borrowers.
    function maxWithdraw(address owner) public view override returns (uint256) {
        return Math.min(super.maxWithdraw(owner), _pool().idle);
    }

    function maxRedeem(address owner) public view override returns (uint256) {
        return Math.min(super.maxRedeem(owner), _convertToShares(_pool().idle, Math.Rounding.Floor));
    }

    /// @dev Virtual shares against the first-depositor inflation attack.
    function _decimalsOffset() internal pure override returns (uint8) {
        return 6;
    }

    function _deposit(address caller, address receiver, uint256 assets, uint256 shares)
        internal
        override
    {
        super._deposit(caller, receiver, assets, shares);
        _pool().idle += assets;
    }

    function _withdraw(
        address caller,
        address receiver,
        address owner,
        uint256 assets,
        uint256 shares
    ) internal override {
        _pool().idle -= assets;
        super._withdraw(caller, receiver, owner, assets, shares);
    }

    function _pool() internal pure returns (PoolStorage storage $) {
        assembly {
            $.slot := POOL_STORAGE
        }
    }
}
