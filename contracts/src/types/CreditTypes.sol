// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @notice How a top-up was paid. The contract, not the relayer, turns this
///         into a hold period.
enum DepositMethod {
    Bank,
    Card
}

struct Params {
    /// @notice How long a cycle may stay open before it is due.
    uint64 term;
    /// @notice Time after `dueAt` before anyone can mark a default.
    uint64 grace;
    /// @notice A cycle shorter than this settles the debt and proves nothing.
    uint64 minCycleDuration;
    /// @notice How long a card deposit waits before it counts, for chargebacks.
    uint64 cardHold;
    /// @notice A cycle that used less of its limit than this proves nothing.
    uint16 minUtilizationBps;
    /// @notice The pool's cut of a borrower's collateral yield.
    uint16 yieldFeeBps;
}

struct Account {
    uint256 drawn;
    uint256 limitAtDraw;
    uint256 peakDrawn;
    uint64 drawnAt;
    uint64 dueAt;
    /// @notice Qualifying cycles plus defaults.
    uint64 cycleCount;
    /// @notice Qualifying cycles repaid to zero.
    uint64 repayCount;
    /// @notice Sum of utilisation over qualifying cycles, in bps.
    uint64 volumeBps;
    bool defaulted;
}

struct Collateral {
    /// @notice Yield-vault shares counted toward the limit.
    uint256 shares;
    /// @notice Asset value of `shares` when the yield fee was last taken.
    uint256 principal;
    /// @notice Card deposits still inside their hold.
    uint256 pendingShares;
    uint256 pendingPrincipal;
    uint64 pendingUntil;
}
