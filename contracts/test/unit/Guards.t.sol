// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

import {MatoCreditLine} from "../../src/MatoCreditLine.sol";
import {IMatoCreditLine} from "../../src/interfaces/IMatoCreditLine.sol";
import {MockEarnAUSD} from "../../src/testnet/MockEarnAUSD.sol";
import {TestAUSD} from "../../src/testnet/TestAUSD.sol";
import {DepositMethod, Params} from "../../src/types/CreditTypes.sol";
import {Deployers} from "../helpers/Deployers.sol";

/// @dev The refusals. None is interesting alone; together they are the
///      difference between "the happy path works" and "it refuses what it
///      says it refuses".
contract GuardsTest is Deployers {
    function test_zeroAmountsAreRefused() public {
        _topUp(siti, 150 * AUSD, DepositMethod.Card);

        vm.startPrank(relayer);
        vm.expectRevert(IMatoCreditLine.ZeroAmount.selector);
        line.depositFor(siti, 0, DepositMethod.Bank);
        vm.expectRevert(IMatoCreditLine.ZeroAmount.selector);
        line.cancelPending(siti, 0);
        vm.stopPrank();

        skip(60);
        vm.startPrank(siti);
        vm.expectRevert(IMatoCreditLine.ZeroAmount.selector);
        line.draw(0, mom);
        vm.expectRevert(IMatoCreditLine.ZeroAmount.selector);
        line.withdrawCollateral(0);
        line.draw(10 * AUSD, mom);
        vm.expectRevert(IMatoCreditLine.ZeroAmount.selector);
        line.repay(0);
        vm.expectRevert(IMatoCreditLine.ZeroAmount.selector);
        line.repayFromCollateral(0);
        vm.stopPrank();

        vm.expectRevert(IMatoCreditLine.ZeroAmount.selector);
        line.redeemPoolShares(0);
    }

    function test_drawToTheZeroAddressIsRefused() public {
        _topUp(siti, 150 * AUSD, DepositMethod.Bank);
        vm.prank(siti);
        vm.expectRevert(IMatoCreditLine.ZeroAddress.selector);
        line.draw(1, address(0));
    }

    function test_repayFromCollateralWithNothingOwed() public {
        _topUp(siti, 150 * AUSD, DepositMethod.Bank);
        vm.prank(siti);
        vm.expectRevert(IMatoCreditLine.NothingOwed.selector);
        line.repayFromCollateral(1);
    }

    function test_redeemingMorePoolSharesThanHeld() public {
        vm.expectRevert(
            abi.encodeWithSelector(IMatoCreditLine.InsufficientCollateral.selector, 1, 0)
        );
        line.redeemPoolShares(1);
    }

    function test_badParamsAreRefused() public {
        Params memory p = _testnetParams();
        vm.startPrank(admin);

        p.term = 0;
        vm.expectRevert(IMatoCreditLine.BadParams.selector);
        line.setParams(p);

        p = _testnetParams();
        p.minUtilizationBps = 10_001;
        vm.expectRevert(IMatoCreditLine.BadParams.selector);
        line.setParams(p);

        p = _testnetParams();
        p.yieldFeeBps = 10_001;
        vm.expectRevert(IMatoCreditLine.BadParams.selector);
        line.setParams(p);

        vm.stopPrank();
    }

    function test_onlyAdminGoverns() public {
        bytes memory denied = abi.encodeWithSelector(
            IAccessControl.AccessControlUnauthorizedAccount.selector, relayer, bytes32(0)
        );
        vm.startPrank(relayer);
        vm.expectRevert(denied);
        line.setParams(_testnetParams());
        vm.expectRevert(denied);
        line.pause();
        vm.expectRevert(denied);
        line.unpause();
        vm.stopPrank();
    }

    function test_unpauseRestoresDraws() public {
        _topUp(siti, 150 * AUSD, DepositMethod.Bank);
        vm.startPrank(admin);
        line.pause();
        line.unpause();
        vm.stopPrank();
        assertFalse(line.paused());
        _draw(siti, 10 * AUSD);
        assertEq(line.accountOf(siti).drawn, 10 * AUSD);
    }

    function test_depositsBlockedWhilePaused() public {
        vm.prank(admin);
        line.pause();
        vm.prank(relayer);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        line.depositFor(siti, 1, DepositMethod.Bank);
    }

    function test_vaultMustHoldTheSameAsset() public {
        TestAUSD other = new TestAUSD();
        MockEarnAUSD wrongVault = new MockEarnAUSD(other);
        MatoCreditLine impl = new MatoCreditLine();
        bytes memory init =
            abi.encodeCall(MatoCreditLine.initialize, (ausd, wrongVault, admin, _testnetParams()));
        vm.expectRevert(IMatoCreditLine.VaultAssetMismatch.selector);
        new ERC1967Proxy(address(impl), init);
    }
}
