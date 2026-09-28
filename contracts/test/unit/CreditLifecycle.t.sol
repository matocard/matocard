// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IMatoCreditLine} from "../../src/interfaces/IMatoCreditLine.sol";
import {CreditAccount, DepositMethod} from "../../src/types/CreditTypes.sol";
import {Deployers} from "../helpers/Deployers.sol";

contract CreditLifecycleTest is Deployers {
    /// @dev The demo script, PLAN §3 steps 3 to 6, with the §6.3 numbers.
    function test_demoFlow() public {
        _topUp(siti, 150 * AUSD, DepositMethod.Card);
        assertEq(line.limitOf(siti), 0, "card deposit counts before its hold");

        skip(60);
        assertEq(line.limitOf(siti), 100_000_000);

        _draw(siti, 50 * AUSD);
        assertEq(ausd.balanceOf(mom), 50 * AUSD, "mom receives the draw");

        skip(61);
        _repay(siti, 50 * AUSD);

        assertEq(line.scoreOf(siti), 17);
        assertEq(line.limitOf(siti), 108_616_944);
    }

    function test_threeCyclesAtEightyPercent() public {
        _topUp(siti, 150 * AUSD, DepositMethod.Bank);
        for (uint256 i; i < 3; ++i) {
            uint256 amount = (line.limitOf(siti) * 8) / 10;
            _draw(siti, amount);
            skip(1 days);
            _repay(siti, amount);
        }
        assertEq(line.scoreOf(siti), 55);
        assertEq(line.limitOf(siti), 134_529_147);
    }

    function test_shortCycleDoesNotCount() public {
        _topUp(siti, 150 * AUSD, DepositMethod.Bank);
        _draw(siti, 50 * AUSD);
        skip(59);
        _repay(siti, 50 * AUSD);
        _assertNoCycle();
    }

    function test_lowUtilizationDoesNotCount() public {
        _topUp(siti, 150 * AUSD, DepositMethod.Bank);
        _draw(siti, 9 * AUSD); // 9% of a 100 limit
        skip(1 days);
        _repay(siti, 9 * AUSD);
        _assertNoCycle();
    }

    function test_lateRepayDoesNotCount() public {
        _topUp(siti, 150 * AUSD, DepositMethod.Bank);
        _draw(siti, 50 * AUSD);
        skip(30 days + 1);
        _repay(siti, 50 * AUSD);
        _assertNoCycle();
    }

    function test_partialRepayKeepsCycleOpen() public {
        _topUp(siti, 150 * AUSD, DepositMethod.Bank);
        _draw(siti, 50 * AUSD);
        skip(1 days);
        _repay(siti, 49 * AUSD);

        CreditAccount memory a = line.accountOf(siti);
        assertEq(a.drawn, 1 * AUSD);
        assertEq(a.repayCount, 0);
        assertGt(a.drawnAt, 0, "cycle still open");
    }

    function test_overpaymentIsCapped() public {
        _topUp(siti, 150 * AUSD, DepositMethod.Bank);
        _draw(siti, 50 * AUSD);
        ausd.mint(siti, 80 * AUSD);
        vm.startPrank(siti);
        ausd.approve(address(line), 80 * AUSD);
        line.repay(80 * AUSD);
        vm.stopPrank();
        assertEq(ausd.balanceOf(siti), 30 * AUSD, "only the balance owed is taken");
    }

    function test_repayForByRelayer() public {
        _topUp(siti, 150 * AUSD, DepositMethod.Bank);
        _draw(siti, 50 * AUSD);
        skip(1 days);
        vm.prank(relayer);
        line.repayFor(siti, 50 * AUSD);
        assertEq(line.scoreOf(siti), 17);
    }

    function test_repayFromCollateral() public {
        _topUp(siti, 150 * AUSD, DepositMethod.Bank);
        _draw(siti, 50 * AUSD);
        skip(1 days);
        vm.prank(siti);
        line.repayFromCollateral(50 * AUSD);

        assertEq(line.accountOf(siti).drawn, 0);
        assertEq(line.scoreOf(siti), 17);
        assertApproxEqAbs(line.collateralValueOf(siti), 100 * AUSD, 1);
    }

    function test_repayWorksWhilePaused() public {
        _topUp(siti, 150 * AUSD, DepositMethod.Bank);
        _draw(siti, 50 * AUSD);
        vm.prank(admin);
        line.pause();
        _repay(siti, 50 * AUSD);
        assertEq(line.accountOf(siti).drawn, 0);
    }

    function test_drawBlockedWhilePaused() public {
        _topUp(siti, 150 * AUSD, DepositMethod.Bank);
        vm.prank(admin);
        line.pause();
        vm.expectRevert();
        _draw(siti, 10 * AUSD);
    }

    function test_drawNeedsVerification() public {
        vm.expectRevert(abi.encodeWithSelector(IMatoCreditLine.NotVerified.selector, stranger));
        _draw(stranger, 1);
    }

    function test_drawBeyondLimitReverts() public {
        _topUp(siti, 150 * AUSD, DepositMethod.Bank);
        vm.expectRevert(
            abi.encodeWithSelector(IMatoCreditLine.ExceedsLimit.selector, 101 * AUSD, 100 * AUSD)
        );
        _draw(siti, 101 * AUSD);
    }

    function test_drawLimitedByPoolLiquidity() public {
        _topUp(siti, 30_000 * AUSD, DepositMethod.Bank);
        assertEq(line.availableOf(siti), LP_DEPOSIT, "available is capped at idle");
        vm.expectRevert(
            abi.encodeWithSelector(
                IMatoCreditLine.InsufficientLiquidity.selector, 15_000 * AUSD, LP_DEPOSIT
            )
        );
        _draw(siti, 15_000 * AUSD);
    }

    function test_repayWithNothingOwedReverts() public {
        vm.prank(siti);
        vm.expectRevert(IMatoCreditLine.NothingOwed.selector);
        line.repay(1);
    }

    function _assertNoCycle() internal view {
        CreditAccount memory a = line.accountOf(siti);
        assertEq(a.drawn, 0);
        assertEq(a.cycleCount, 0);
        assertEq(a.repayCount, 0);
        assertEq(line.scoreOf(siti), 0);
    }
}
