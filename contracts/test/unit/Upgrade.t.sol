// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";

import {MatoCreditLine} from "../../src/MatoCreditLine.sol";
import {DepositMethod} from "../../src/types/CreditTypes.sol";
import {Deployers} from "../helpers/Deployers.sol";

contract MatoCreditLineV2 is MatoCreditLine {
    function version() external pure returns (uint256) {
        return 2;
    }
}

contract UpgradeTest is Deployers {
    function test_implementationCannotBeInitialized() public {
        MatoCreditLine impl = new MatoCreditLine();
        vm.expectRevert(Initializable.InvalidInitialization.selector);
        impl.initialize(ausd, vault, admin, _testnetParams());
    }

    function test_proxyCannotBeInitializedTwice() public {
        vm.expectRevert(Initializable.InvalidInitialization.selector);
        line.initialize(ausd, vault, stranger, _testnetParams());
    }

    function test_onlyAdminCanUpgrade() public {
        address v2 = address(new MatoCreditLineV2());
        bytes32 role = line.DEFAULT_ADMIN_ROLE();
        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, stranger, role
            )
        );
        line.upgradeToAndCall(v2, "");
    }

    function test_upgradeKeepsEveryModulesState() public {
        _topUp(siti, 150 * AUSD, DepositMethod.Bank);
        _draw(siti, 50 * AUSD);
        vm.warp(block.timestamp + 1 days);
        _repay(siti, 50 * AUSD);
        _topUp(siti, 10 * AUSD, DepositMethod.Card);

        uint256 limit = line.limitOf(siti);
        uint256 lpShares = line.balanceOf(lp);
        uint256 pending = line.collateralOf(siti).pendingShares;

        address v2 = address(new MatoCreditLineV2());
        vm.prank(admin);
        line.upgradeToAndCall(v2, "");

        assertEq(MatoCreditLineV2(address(line)).version(), 2);
        assertEq(line.scoreOf(siti), 17, "credit");
        assertEq(line.limitOf(siti), limit, "collateral");
        assertEq(line.collateralOf(siti).pendingShares, pending, "pending");
        assertTrue(line.isVerified(siti), "identity");
        assertEq(line.balanceOf(lp), lpShares, "pool");
        assertEq(line.params().cardHold, 60, "governed");
        assertTrue(line.hasRole(line.RELAYER_ROLE(), relayer), "roles");
    }

    function test_adminHandoverTakesTwoStepsAndADay() public {
        vm.prank(admin);
        line.beginDefaultAdminTransfer(stranger);

        vm.prank(stranger);
        vm.expectRevert();
        line.acceptDefaultAdminTransfer();

        vm.warp(block.timestamp + 1 days + 1);
        vm.prank(stranger);
        line.acceptDefaultAdminTransfer();
        assertEq(line.defaultAdmin(), stranger);
    }
}
