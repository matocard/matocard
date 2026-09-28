// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IMatoCreditLine} from "../../src/interfaces/IMatoCreditLine.sol";
import {CreditAccount, DepositMethod} from "../../src/types/CreditTypes.sol";
import {Deployers} from "../helpers/Deployers.sol";

contract DefaultTest is Deployers {
    uint256 internal dueAt;

    function setUp() public override {
        super.setUp();
        _topUp(siti, 150 * AUSD, DepositMethod.Bank);
        _draw(siti, 100 * AUSD);
        dueAt = line.accountOf(siti).dueAt;
    }

    function test_notDefaultableInsideGrace() public {
        uint64 defaultableAt = uint64(dueAt + 3 days);
        vm.warp(defaultableAt);
        vm.expectRevert(abi.encodeWithSelector(IMatoCreditLine.NotOverdue.selector, defaultableAt));
        line.markDefaulted(siti);

        vm.warp(defaultableAt + 1);
        line.markDefaulted(siti);
    }

    function test_seizesOnlyTheDebt() public {
        uint256 assetsBefore = line.totalAssets();
        _default();

        assertApproxEqAbs(line.collateralValueOf(siti), 50 * AUSD, 1, "the rest stays hers");
        assertApproxEqAbs(line.totalAssets(), assetsBefore, 1, "debt swapped for shares");
        assertEq(line.totalDrawn(), 0);

        uint256 left = line.collateralOf(siti).shares;
        vm.prank(siti);
        line.withdrawCollateral(left);
        assertApproxEqAbs(ausd.balanceOf(siti), 50 * AUSD, 1);
    }

    function test_recordFollowsTheDefault() public {
        _default();
        CreditAccount memory a = line.accountOf(siti);
        assertTrue(a.defaulted);
        assertEq(a.cycleCount, 1);
        assertEq(a.repayCount, 0);
        assertEq(line.scoreOf(siti), 0);
        assertEq(line.availableOf(siti), 0);

        vm.expectRevert(abi.encodeWithSelector(IMatoCreditLine.AccountInDefault.selector, siti));
        _draw(siti, 1);
    }

    function test_shortfallFallsOnThePool() public {
        _halveTheVault();
        uint256 assetsBefore = line.totalAssets();
        _default();

        assertEq(line.collateralOf(siti).shares, 0, "all 75 AUSD of collateral seized");
        assertApproxEqAbs(assetsBefore - line.totalAssets(), 25 * AUSD, 1);
    }

    function test_vaultLossBlocksDrawsButDoesNotDefault() public {
        _halveTheVault();
        assertLt(line.limitOf(siti), 100 * AUSD);
        vm.expectRevert();
        _draw(siti, 1);

        vm.expectRevert(
            abi.encodeWithSelector(IMatoCreditLine.NotOverdue.selector, uint64(dueAt + 3 days))
        );
        line.markDefaulted(siti);
    }

    function test_nothingToDefault() public {
        vm.warp(dueAt + 3 days + 1);
        vm.expectRevert(IMatoCreditLine.NothingOwed.selector);
        line.markDefaulted(stranger);
    }

    function _default() internal {
        vm.warp(dueAt + 3 days + 1);
        line.markDefaulted(siti);
    }

    function _halveTheVault() internal {
        deal(address(ausd), address(vault), ausd.balanceOf(address(vault)) / 2);
    }
}
