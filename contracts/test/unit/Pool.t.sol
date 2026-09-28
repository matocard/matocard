// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {DepositMethod} from "../../src/types/CreditTypes.sol";
import {Deployers} from "../helpers/Deployers.sol";

contract PoolTest is Deployers {
    function test_lendersCannotWithdrawLentFunds() public {
        _topUp(siti, 150 * AUSD, DepositMethod.Bank);
        _draw(siti, 100 * AUSD);

        assertEq(line.idle(), LP_DEPOSIT - 100 * AUSD);
        assertEq(line.maxWithdraw(lp), line.idle());
        assertEq(line.totalAssets(), LP_DEPOSIT);

        vm.prank(lp);
        vm.expectRevert();
        line.withdraw(LP_DEPOSIT, lp, lp);
    }

    function test_donationDoesNotMoveSharePrice() public {
        uint256 price = line.convertToAssets(1e12);
        ausd.mint(address(line), 5_000 * AUSD);
        assertEq(line.convertToAssets(1e12), price);
        assertEq(line.totalAssets(), LP_DEPOSIT);
    }

    function test_redeemPoolSharesMovesValueToIdle() public {
        _topUp(siti, 150 * AUSD, DepositMethod.Bank);
        _draw(siti, 100 * AUSD);
        vm.warp(block.timestamp + 33 days + 1);
        line.markDefaulted(siti);

        uint256 shares = line.poolShares();
        uint256 idleBefore = line.idle();
        line.redeemPoolShares(shares);

        assertEq(line.poolShares(), 0);
        assertApproxEqAbs(line.idle() - idleBefore, 100 * AUSD, 1);
        assertApproxEqAbs(line.totalAssets(), LP_DEPOSIT, 1);
    }

    function test_lenderRoundTrip() public {
        uint256 shares = line.balanceOf(lp);
        vm.prank(lp);
        line.redeem(shares, lp, lp);
        assertEq(ausd.balanceOf(lp), LP_DEPOSIT);
    }
}
