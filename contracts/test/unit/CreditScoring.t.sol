// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";

import {CreditScoring} from "../../src/libraries/CreditScoring.sol";

/// @dev The PLAN §6.3 table is written out as literals. Deriving the expected
///      values from the library would agree with any change to it.
contract CreditScoringTest is Test {
    uint256 internal constant AUSD = 1e6;
    uint256 internal constant COLLATERAL = 150 * AUSD;

    // ---- the demo table ----

    function test_newAccount() public pure {
        uint256 s = CreditScoring.score(0, 0, 0);
        assertEq(s, 0);
        assertEq(CreditScoring.ratioBps(s), 15_000);
        assertEq(CreditScoring.limit(COLLATERAL, s), 100_000_000); // 100.00
    }

    function test_oneCycleAtHalfTheLimit() public pure {
        uint256 volume = CreditScoring.utilizationBps(50 * AUSD, 100 * AUSD);
        assertEq(volume, 5_000);

        assertEq(CreditScoring.recordPoints(1, 1), 13);
        assertEq(CreditScoring.consistencyPoints(1), 2);
        assertEq(CreditScoring.volumePoints(volume), 2);

        uint256 s = CreditScoring.score(1, 1, volume);
        assertEq(s, 17);
        assertEq(CreditScoring.ratioBps(s), 13_810);
        assertEq(CreditScoring.limit(COLLATERAL, s), 108_616_944); // 108.61
    }

    function test_threeCyclesAtEightyPercent() public pure {
        uint256 s = CreditScoring.score(3, 3, 3 * 8_000);
        assertEq(CreditScoring.recordPoints(3, 3), 40);
        assertEq(CreditScoring.consistencyPoints(3), 6);
        assertEq(CreditScoring.volumePoints(24_000), 9);
        assertEq(s, 55);
        assertEq(CreditScoring.ratioBps(s), 11_150);
        assertEq(CreditScoring.limit(COLLATERAL, s), 134_529_147); // 134.52
    }

    // ---- components ----

    function test_recordRampsOverThreeCycles() public pure {
        assertEq(CreditScoring.recordPoints(1, 1), 13);
        assertEq(CreditScoring.recordPoints(2, 2), 26);
        assertEq(CreditScoring.recordPoints(3, 3), 40);
        assertEq(CreditScoring.recordPoints(10, 10), 40);
    }

    function test_defaultDragsRecordDown() public pure {
        // three cycles, one of them a default
        assertEq(CreditScoring.recordPoints(3, 2), 26);
        // a lone default earns nothing
        assertEq(CreditScoring.recordPoints(1, 0), 0);
    }

    function test_recordIgnoresRepaysBeyondCycles() public pure {
        assertEq(CreditScoring.recordPoints(2, 5), CreditScoring.recordPoints(2, 2));
    }

    function test_consistencyCapsAtTen() public pure {
        assertEq(CreditScoring.consistencyPoints(10), 20);
        assertEq(CreditScoring.consistencyPoints(50), 20);
    }

    function test_volumeCapsAtTenFullCycles() public pure {
        assertEq(CreditScoring.volumePoints(100_000), 40);
        assertEq(CreditScoring.volumePoints(500_000), 40);
    }

    function test_utilizationCapsAtFull() public pure {
        assertEq(CreditScoring.utilizationBps(120 * AUSD, 100 * AUSD), 10_000);
        assertEq(CreditScoring.utilizationBps(1, 0), 0);
    }

    function test_perfectRecordScoresHundred() public pure {
        uint256 s = CreditScoring.score(10, 10, 100_000);
        assertEq(s, 100);
        assertEq(CreditScoring.ratioBps(s), 8_000);
        assertEq(CreditScoring.limit(COLLATERAL, s), 187_500_000);
    }

    function test_ratioClampsAboveHundred() public pure {
        assertEq(CreditScoring.ratioBps(250), 8_000);
    }

    function test_availableNeverUnderflows() public pure {
        assertEq(CreditScoring.available(COLLATERAL, 0, 40 * AUSD), 60 * AUSD);
        assertEq(CreditScoring.available(COLLATERAL, 0, 120 * AUSD), 0);
    }

    // ---- properties ----

    function testFuzz_scoreStaysInRange(uint64 cycles, uint64 repays, uint64 volume) public pure {
        assertLe(CreditScoring.score(cycles, repays, volume), 100);
    }

    function testFuzz_limitNeverFallsAsScoreRises(uint128 collateral, uint8 a, uint8 b)
        public
        pure
    {
        uint256 lo = bound(a, 0, 100);
        uint256 hi = bound(b, lo, 100);
        assertLe(CreditScoring.limit(collateral, lo), CreditScoring.limit(collateral, hi));
    }

    function testFuzz_ratioStaysBetweenBounds(uint256 s) public pure {
        uint256 r = CreditScoring.ratioBps(s);
        assertGe(r, 8_000);
        assertLe(r, 15_000);
    }
}
