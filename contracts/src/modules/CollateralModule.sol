// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {Collateral, DepositMethod} from "../types/CreditTypes.sol";
import {IdentityModule} from "./IdentityModule.sol";
import {PoolModule} from "./PoolModule.sol";

/// @title CollateralModule
/// @notice Borrowers' collateral, held as yield-vault shares so it grows.
/// @dev Card top-ups wait out a hold the relayer cannot shorten, and can be
///      reversed during it for a chargeback. The pool takes `yieldFeeBps` of
///      each borrower's collateral yield whenever collateral changes.
abstract contract CollateralModule is PoolModule, IdentityModule {
    using SafeERC20 for IERC20;

    /// @custom:storage-location erc7201:matocard.storage.Collateral
    struct CollateralStorage {
        mapping(address => Collateral) collateral;
    }

    // keccak256(abi.encode(uint256(keccak256("matocard.storage.Collateral")) - 1)) & ~bytes32(uint256(0xff))
    bytes32 private constant COLLATERAL_STORAGE =
        0x6c989f441bd26b9ce670089252d2e5a356f6a1be87dd27838890df7a1ed17b00;

    /// @notice Credits a fiat top-up. The AUSD comes from the relayer's treasury.
    /// @dev The relayer names the method; the contract decides the hold.
    function depositFor(address account, uint256 assets, DepositMethod method)
        external
        onlyRole(RELAYER_ROLE)
        whenNotPaused
        nonReentrant
    {
        _addCollateral(account, msg.sender, assets, method);
    }

    /// @notice Posts AUSD the caller already holds. Counts immediately.
    function depositCollateral(uint256 assets) external whenNotPaused nonReentrant {
        _addCollateral(msg.sender, msg.sender, assets, DepositMethod.Bank);
    }

    /// @notice Moves card deposits whose hold has ended into collateral.
    function settlePending(address account) external {
        _settlePending(account, _collateralOf(account));
    }

    /// @notice Reverses card deposits still inside their hold, for a chargeback.
    /// @dev The shares go back to the relayer's treasury. Collateral that has
    ///      cleared its hold is out of reach.
    function cancelPending(address account, uint256 shares)
        external
        onlyRole(RELAYER_ROLE)
        nonReentrant
    {
        Collateral storage c = _collateralOf(account);
        _settlePending(account, c);
        if (shares == 0) revert ZeroAmount();
        if (shares > c.pendingShares) revert InsufficientCollateral(shares, c.pendingShares);

        c.pendingPrincipal -= Math.mulDiv(c.pendingPrincipal, shares, c.pendingShares);
        c.pendingShares -= shares;
        IERC20(address(yieldVault())).safeTransfer(msg.sender, shares);
        emit PendingCancelled(account, shares, msg.sender);
    }

    function collateralOf(address account) external view returns (Collateral memory) {
        return _collateralOf(account);
    }

    /// @notice Collateral counted toward the limit, net of the yield fee owed,
    ///         including card deposits whose hold has ended.
    function collateralValueOf(address account) public view returns (uint256 value) {
        Collateral storage c = _collateralOf(account);
        value = _value(c);
        if (c.pendingShares != 0 && block.timestamp >= c.pendingUntil) {
            value += yieldVault().convertToAssets(c.pendingShares);
        }
    }

    function _addCollateral(address account, address payer, uint256 assets, DepositMethod method)
        internal
    {
        if (assets == 0) revert ZeroAmount();
        _requireVerified(account);

        IERC20 ausd = IERC20(asset());
        ausd.safeTransferFrom(payer, address(this), assets);
        ausd.forceApprove(address(yieldVault()), assets);
        uint256 shares = yieldVault().deposit(assets, address(this));

        Collateral storage c = _prepareCollateral(account);
        uint64 countsFrom = uint64(block.timestamp);
        uint64 hold = params().cardHold;
        if (method == DepositMethod.Card && hold != 0) {
            countsFrom += hold;
            if (countsFrom > c.pendingUntil) c.pendingUntil = countsFrom;
            countsFrom = c.pendingUntil;
            c.pendingShares += shares;
            c.pendingPrincipal += assets;
        } else {
            c.shares += shares;
            c.principal += assets;
        }
        emit CollateralDeposited(account, payer, method, assets, shares, countsFrom);
    }

    /// @dev Settles matured card deposits and takes the yield fee, so every
    ///      change to collateral starts from an up-to-date basis.
    function _prepareCollateral(address account) internal returns (Collateral storage c) {
        c = _collateralOf(account);
        _settlePending(account, c);
        _takeYieldFee(account, c);
    }

    /// @dev Removes settled shares and the matching slice of the fee basis.
    function _removeShares(Collateral storage c, uint256 shares) internal {
        if (shares > c.shares) revert InsufficientCollateral(shares, c.shares);
        c.principal -= Math.mulDiv(c.principal, shares, c.shares);
        c.shares -= shares;
    }

    function _settlePending(address account, Collateral storage c) internal {
        uint256 shares = c.pendingShares;
        if (shares == 0 || block.timestamp < c.pendingUntil) return;
        c.shares += shares;
        c.principal += c.pendingPrincipal;
        c.pendingShares = 0;
        c.pendingPrincipal = 0;
        c.pendingUntil = 0;
        emit PendingSettled(account, shares);
    }

    function _takeYieldFee(address account, Collateral storage c) internal {
        if (c.shares == 0) return;
        uint256 value = yieldVault().convertToAssets(c.shares);
        uint256 fee = _feeOwed(value, c.principal);
        if (fee == 0) return;
        uint256 feeShares = Math.min(yieldVault().convertToShares(fee), c.shares);
        c.shares -= feeShares;
        c.principal = value - fee;
        _pool().poolShares += feeShares;
        emit YieldFeeTaken(account, feeShares);
    }

    function _feeOwed(uint256 value, uint256 principal) internal view returns (uint256) {
        if (value <= principal) return 0;
        return ((value - principal) * params().yieldFeeBps) / BPS;
    }

    /// @dev Settled collateral, net of the yield fee not yet taken.
    function _value(Collateral storage c) internal view returns (uint256) {
        uint256 value = yieldVault().convertToAssets(c.shares);
        return value - _feeOwed(value, c.principal);
    }

    function _collateralOf(address account) internal view returns (Collateral storage) {
        return _collateral().collateral[account];
    }

    function _collateral() private pure returns (CollateralStorage storage $) {
        assembly {
            $.slot := COLLATERAL_STORAGE
        }
    }
}
