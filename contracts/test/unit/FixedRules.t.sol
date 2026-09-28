// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IMatoCreditLine} from "../../src/interfaces/IMatoCreditLine.sol";
import {CreditAccount, DepositMethod, Params} from "../../src/types/CreditTypes.sol";
import {Deployers} from "../helpers/Deployers.sol";

/// @dev A parameter change must not reach a cycle that is already open.
contract FixedRulesTest is Deployers {
    bytes32 internal constant CREDIT_STORAGE =
        0x672b687690eb5300e6ac2b9086f8f67ad427ef12e1c0376293cf5fab7c14fb00;

    function setUp() public override {
        super.setUp();
        _topUp(siti, 150 * AUSD, DepositMethod.Bank);
        _draw(siti, 50 * AUSD);
    }

    function test_shorterGraceDoesNotBringADefaultForward() public {
        uint64 defaultableAt = line.accountOf(siti).defaultableAt;
        assertEq(defaultableAt, line.accountOf(siti).dueAt + 3 days);

        _setParams(_with(0, 60, 1_000));

        vm.warp(defaultableAt);
        vm.expectRevert(abi.encodeWithSelector(IMatoCreditLine.NotOverdue.selector, defaultableAt));
        line.markDefaulted(siti);
    }

    function test_stricterCycleRulesDoNotReachAnOpenCycle() public {
        _setParams(_with(3 days, 1 days, 9_000));
        skip(61);
        _repay(siti, 50 * AUSD);
        assertEq(line.accountOf(siti).repayCount, 1, "judged by the rules it opened under");
    }

    function test_newRulesApplyFromTheNextCycle() public {
        skip(61);
        _repay(siti, 50 * AUSD);
        _setParams(_with(3 days, 1 days, 1_000));

        _draw(siti, 50 * AUSD);
        assertEq(line.accountOf(siti).cycleMinDuration, 1 days);
        skip(61);
        _repay(siti, 50 * AUSD);
        assertEq(line.accountOf(siti).repayCount, 1, "second cycle too short under new rules");
    }

    function test_closedCycleClearsItsRules() public {
        skip(61);
        _repay(siti, 50 * AUSD);
        CreditAccount memory a = line.accountOf(siti);
        assertEq(a.defaultableAt, 0);
        assertEq(a.cycleMinDuration, 0);
        assertEq(a.cycleMinUtilizationBps, 0);
    }

    /// @dev A cycle opened by the first implementation has none of the new
    ///      fields. It falls back to the current parameters instead of reading
    ///      a defaultable time of zero, which would allow an instant default.
    function test_cycleFromTheFirstImplementationFallsBackToParams() public {
        _clearFixedRules(siti);
        assertEq(line.accountOf(siti).defaultableAt, 0);

        uint64 dueAt = line.accountOf(siti).dueAt;
        vm.expectRevert(abi.encodeWithSelector(IMatoCreditLine.NotOverdue.selector, dueAt + 3 days));
        line.markDefaulted(siti);

        skip(61);
        _repay(siti, 50 * AUSD);
        assertEq(line.accountOf(siti).repayCount, 1);
    }

    function _with(uint64 grace, uint64 minCycle, uint16 minUtil)
        internal
        pure
        returns (Params memory p)
    {
        p = _testnetParams();
        p.grace = grace;
        p.minCycleDuration = minCycle;
        p.minUtilizationBps = minUtil;
    }

    function _setParams(Params memory p) internal {
        vm.prank(admin);
        line.setParams(p);
    }

    /// @dev Slot 4 of a CreditAccount packs volumeBps (bytes 0-7), defaulted
    ///      (8), then the appended defaultableAt (9-16), cycleMinDuration
    ///      (17-24) and cycleMinUtilizationBps (25-26). Keeping only the first
    ///      nine bytes reproduces what the first implementation left behind.
    function _clearFixedRules(address who) internal {
        bytes32 slot = bytes32(uint256(keccak256(abi.encode(who, CREDIT_STORAGE))) + 4);
        uint256 packed = uint256(vm.load(address(line), slot));
        vm.store(address(line), slot, bytes32(packed & ((uint256(1) << 72) - 1)));
    }
}
