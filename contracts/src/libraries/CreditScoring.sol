// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @title CreditScoring
/// @notice Turns a repayment record into a score, a collateral ratio and a limit.
/// @dev Pure and integer-only, so anyone can read the inputs off the chain and
///      recompute a limit by hand. Each component is floored once.
///
///      score = Record (40) + Consistency (20) + Volume (40)
///      ratio = 150% at score 0, falling linearly to 80% at score 100
///      limit = collateral / ratio
library CreditScoring {
    uint256 internal constant BPS = 10_000;
    uint256 internal constant MAX_RATIO_BPS = 15_000;
    uint256 internal constant MIN_RATIO_BPS = 8_000;
    uint256 internal constant MAX_SCORE = 100;

    uint256 internal constant RECORD_WEIGHT = 40;
    uint256 internal constant CONSISTENCY_WEIGHT = 20;
    uint256 internal constant VOLUME_WEIGHT = 40;

    /// @notice Cycles needed before Record can reach full weight.
    uint256 internal constant RECORD_RAMP = 3;
    /// @notice Qualifying repays beyond this earn no more Consistency.
    uint256 internal constant CONSISTENCY_TARGET = 10;
    /// @notice Summed utilisation for full Volume: ten cycles at the full limit.
    uint256 internal constant VOLUME_TARGET_BPS = 100_000;

    /// @param cycleCount Qualifying cycles plus defaults.
    /// @param repayCount Qualifying cycles repaid to zero.
    /// @param volumeBps Sum of `utilizationBps` over qualifying cycles.
    function score(uint256 cycleCount, uint256 repayCount, uint256 volumeBps)
        internal
        pure
        returns (uint256)
    {
        return recordPoints(cycleCount, repayCount) + consistencyPoints(repayCount)
            + volumePoints(volumeBps);
    }

    /// @dev Share of cycles repaid, scaled by a confidence ramp so a single
    ///      cycle cannot earn the full 40. A default sits in `cycleCount`
    ///      without a repay, which is how it costs the borrower.
    function recordPoints(uint256 cycleCount, uint256 repayCount) internal pure returns (uint256) {
        if (cycleCount == 0) return 0;
        uint256 settled = repayCount > cycleCount ? cycleCount : repayCount;
        uint256 ramp = cycleCount > RECORD_RAMP ? RECORD_RAMP : cycleCount;
        return (RECORD_WEIGHT * settled * ramp) / (cycleCount * RECORD_RAMP);
    }

    function consistencyPoints(uint256 repayCount) internal pure returns (uint256) {
        uint256 counted = repayCount > CONSISTENCY_TARGET ? CONSISTENCY_TARGET : repayCount;
        return (CONSISTENCY_WEIGHT * counted) / CONSISTENCY_TARGET;
    }

    function volumePoints(uint256 volumeBps) internal pure returns (uint256) {
        uint256 counted = volumeBps > VOLUME_TARGET_BPS ? VOLUME_TARGET_BPS : volumeBps;
        return (VOLUME_WEIGHT * counted) / VOLUME_TARGET_BPS;
    }

    /// @notice How much of the limit a cycle used at its peak, capped at 100%.
    function utilizationBps(uint256 peakDrawn, uint256 limitAtDraw)
        internal
        pure
        returns (uint256)
    {
        if (limitAtDraw == 0) return 0;
        uint256 used = (peakDrawn * BPS) / limitAtDraw;
        return used > BPS ? BPS : used;
    }

    /// @notice Collateral required per unit of credit at a given score, in bps.
    function ratioBps(uint256 score_) internal pure returns (uint256) {
        uint256 bounded = score_ > MAX_SCORE ? MAX_SCORE : score_;
        return MAX_RATIO_BPS - ((MAX_RATIO_BPS - MIN_RATIO_BPS) * bounded) / MAX_SCORE;
    }

    /// @notice Total credit the collateral supports at a given score, rounded down.
    function limit(uint256 collateralValue, uint256 score_) internal pure returns (uint256) {
        return (collateralValue * BPS) / ratioBps(score_);
    }

    /// @notice Credit still drawable after what is already owed.
    function available(uint256 collateralValue, uint256 score_, uint256 drawn)
        internal
        pure
        returns (uint256)
    {
        uint256 ceiling = limit(collateralValue, score_);
        return ceiling > drawn ? ceiling - drawn : 0;
    }
}
