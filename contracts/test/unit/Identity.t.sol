// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";

import {IMatoCreditLine} from "../../src/interfaces/IMatoCreditLine.sol";
import {Deployers} from "../helpers/Deployers.sol";

contract IdentityTest is Deployers {
    function test_bindsBothWays() public view {
        bytes32 id = keccak256("siti");
        assertTrue(line.isVerified(siti));
        assertEq(line.identityOf(siti), id);
        assertEq(line.walletOfIdentity(id), siti);
    }

    function test_oneIdentityCannotTakeASecondWallet() public {
        bytes32 id = keccak256("siti");
        vm.prank(kyc);
        vm.expectRevert(abi.encodeWithSelector(IMatoCreditLine.IdentityTaken.selector, id));
        line.setVerified(stranger, id);
    }

    function test_oneWalletCannotTakeASecondIdentity() public {
        vm.prank(kyc);
        vm.expectRevert(abi.encodeWithSelector(IMatoCreditLine.AlreadyVerified.selector, siti));
        line.setVerified(siti, keccak256("someone else"));
    }

    function test_rejectsEmptyInputs() public {
        vm.startPrank(kyc);
        vm.expectRevert(IMatoCreditLine.ZeroAmount.selector);
        line.setVerified(stranger, bytes32(0));
        vm.expectRevert(IMatoCreditLine.ZeroAddress.selector);
        line.setVerified(address(0), keccak256("x"));
        vm.stopPrank();
    }

    function test_onlyKycRole() public {
        bytes32 role = line.KYC_ROLE();
        vm.prank(relayer);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, relayer, role
            )
        );
        line.setVerified(stranger, keccak256("x"));
    }
}
