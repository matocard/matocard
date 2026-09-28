// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {DepositMethod, Params} from "../types/CreditTypes.sol";

/// @notice Every event and error the credit line emits, in one place for the
///         indexer and the app.
interface IMatoCreditLine {
    event ParamsChanged(Params params);
    event Verified(address indexed wallet, bytes32 indexed identityHash);
    event CollateralDeposited(
        address indexed account,
        address indexed payer,
        DepositMethod method,
        uint256 assets,
        uint256 shares,
        uint64 countsFrom
    );
    event PendingSettled(address indexed account, uint256 shares);
    event PendingCancelled(address indexed account, uint256 shares, address indexed to);
    event CollateralWithdrawn(address indexed account, uint256 shares, uint256 assets);
    event YieldFeeTaken(address indexed account, uint256 shares);
    event Drawn(address indexed account, address indexed to, uint256 amount, uint256 drawn);
    event Repaid(address indexed account, address indexed payer, uint256 amount, uint256 drawn);
    event CycleClosed(address indexed account, bool qualifying, uint256 score);
    event Defaulted(
        address indexed account, uint256 writtenOff, uint256 sharesSeized, uint256 score
    );
    event PoolSharesRedeemed(uint256 shares, uint256 assets);

    error ZeroAmount();
    error ZeroAddress();
    error BadParams();
    error VaultAssetMismatch();
    error NotVerified(address account);
    error AlreadyVerified(address wallet);
    error IdentityTaken(bytes32 identityHash);
    error AccountInDefault(address account);
    error ExceedsLimit(uint256 requested, uint256 available);
    error InsufficientLiquidity(uint256 requested, uint256 idle);
    error InsufficientCollateral(uint256 requested, uint256 held);
    error OverLimitAfterWithdrawal();
    error NothingOwed();
    error NotOverdue(uint64 defaultableAt);
}
