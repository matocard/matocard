// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";

import {IMatoCreditLine} from "../../src/interfaces/IMatoCreditLine.sol";
import {Collateral, DepositMethod} from "../../src/types/CreditTypes.sol";
import {Deployers} from "../helpers/Deployers.sol";

contract CollateralTest is Deployers {
    function test_bankDepositCountsImmediately() public {
        _topUp(siti, 150 * AUSD, DepositMethod.Bank);
        assertEq(line.collateralValueOf(siti), 150 * AUSD);
    }

    function test_cardDepositWaitsOutTheHold() public {
        _topUp(siti, 150 * AUSD, DepositMethod.Card);
        skip(59);
        assertEq(line.collateralValueOf(siti), 0);
        vm.expectRevert(abi.encodeWithSelector(IMatoCreditLine.ExceedsLimit.selector, 1, 0));
        _draw(siti, 1);

        skip(1);
        assertEq(line.collateralValueOf(siti), 150 * AUSD);
    }

    function test_laterCardDepositExtendsTheHold() public {
        _topUp(siti, 100 * AUSD, DepositMethod.Card);
        skip(30);
        _topUp(siti, 50 * AUSD, DepositMethod.Card);
        skip(30);
        assertEq(line.collateralValueOf(siti), 0, "held until the newest deposit clears");
        skip(30);
        assertEq(line.collateralValueOf(siti), 150 * AUSD);
    }

    function test_cancelPendingReturnsSharesToTreasury() public {
        _topUp(siti, 150 * AUSD, DepositMethod.Card);
        uint256 shares = line.collateralOf(siti).pendingShares;

        vm.prank(relayer);
        line.cancelPending(siti, shares);

        assertEq(vault.balanceOf(relayer), shares);
        Collateral memory c = line.collateralOf(siti);
        assertEq(c.pendingShares, 0);
        assertEq(c.pendingPrincipal, 0);
        skip(60);
        assertEq(line.collateralValueOf(siti), 0);
    }

    function test_cancelPendingCannotTouchClearedCollateral() public {
        _topUp(siti, 150 * AUSD, DepositMethod.Card);
        uint256 shares = line.collateralOf(siti).pendingShares;
        skip(60);

        vm.prank(relayer);
        vm.expectRevert(
            abi.encodeWithSelector(IMatoCreditLine.InsufficientCollateral.selector, shares, 0)
        );
        line.cancelPending(siti, shares);
    }

    function test_onlyRelayerCanDepositOrCancel() public {
        bytes32 role = line.RELAYER_ROLE();
        vm.startPrank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, stranger, role
            )
        );
        line.depositFor(siti, 1, DepositMethod.Bank);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, stranger, role
            )
        );
        line.cancelPending(siti, 1);
        vm.stopPrank();
    }

    function test_depositForUnverifiedReverts() public {
        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(IMatoCreditLine.NotVerified.selector, stranger));
        line.depositFor(stranger, 1, DepositMethod.Bank);
    }

    function test_depositCollateralDirectly() public {
        ausd.mint(siti, 150 * AUSD);
        vm.startPrank(siti);
        ausd.approve(address(line), 150 * AUSD);
        line.depositCollateral(150 * AUSD);
        vm.stopPrank();
        assertEq(line.limitOf(siti), 100 * AUSD);
    }

    function test_withdrawCollateralKeepsTheLimitCovered() public {
        _topUp(siti, 150 * AUSD, DepositMethod.Bank);
        _draw(siti, 50 * AUSD);
        uint256 shares = line.collateralOf(siti).shares;

        vm.prank(siti);
        vm.expectRevert(IMatoCreditLine.OverLimitAfterWithdrawal.selector);
        line.withdrawCollateral(shares);

        // 75 AUSD still covers 50 at 150%
        vm.prank(siti);
        line.withdrawCollateral(shares / 2);
        assertEq(ausd.balanceOf(siti), 75 * AUSD);
    }

    function test_yieldRaisesTheLimitNetOfFee() public {
        _topUp(siti, 150 * AUSD, DepositMethod.Bank);
        _distributeYield(150 * AUSD); // doubles the vault

        // 300 of value, 150 of it yield, 20% of that owed to the pool
        assertApproxEqAbs(line.collateralValueOf(siti), 270 * AUSD, 2);
        assertApproxEqAbs(line.limitOf(siti), 180 * AUSD, 2);
    }

    function test_yieldFeeIsTakenIntoThePool() public {
        _topUp(siti, 150 * AUSD, DepositMethod.Bank);
        uint256 before = line.totalAssets();
        _distributeYield(150 * AUSD);

        vm.prank(siti);
        line.withdrawCollateral(1);

        assertGt(line.poolShares(), 0);
        assertApproxEqAbs(line.totalAssets() - before, 30 * AUSD, 2);
    }

    function _distributeYield(uint256 amount) internal {
        ausd.mint(address(this), amount);
        ausd.approve(address(vault), amount);
        vault.distribute(amount);
    }
}
