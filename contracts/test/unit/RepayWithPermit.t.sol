// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IERC20Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";

import {DepositMethod} from "../../src/types/CreditTypes.sol";
import {Deployers} from "../helpers/Deployers.sol";

contract RepayWithPermitTest is Deployers {
    uint256 internal constant BORROWER_KEY = 0xB0770;
    address internal borrower;

    function setUp() public override {
        super.setUp();
        borrower = vm.addr(BORROWER_KEY);
        _verify(borrower, "permit borrower");
        _topUp(borrower, 150 * AUSD, DepositMethod.Bank);
        _draw(borrower, 50 * AUSD);
        ausd.mint(borrower, 50 * AUSD);
        skip(61);
    }

    function test_oneTransactionClosesTheCycle() public {
        (uint8 v, bytes32 r, bytes32 s) = _permit(50 * AUSD, block.timestamp + 1 hours);
        vm.prank(borrower);
        line.repayWithPermit(50 * AUSD, block.timestamp + 1 hours, v, r, s);

        assertEq(line.accountOf(borrower).drawn, 0);
        assertEq(line.scoreOf(borrower), 17);
        assertEq(ausd.allowance(borrower, address(line)), 0, "permit used up exactly");
    }

    function test_aFrontRunPermitDoesNotBlockTheRepayment() public {
        uint256 deadline = block.timestamp + 1 hours;
        (uint8 v, bytes32 r, bytes32 s) = _permit(50 * AUSD, deadline);
        // someone submits the signature first
        ausd.permit(borrower, address(line), 50 * AUSD, deadline, v, r, s);

        vm.prank(borrower);
        line.repayWithPermit(50 * AUSD, deadline, v, r, s);
        assertEq(line.accountOf(borrower).drawn, 0);
    }

    function test_badSignatureWithoutAllowanceReverts() public {
        (uint8 v, bytes32 r, bytes32 s) = _permit(50 * AUSD, block.timestamp + 1 hours);
        vm.prank(borrower);
        vm.expectRevert(
            abi.encodeWithSelector(
                IERC20Errors.ERC20InsufficientAllowance.selector, address(line), 0, 49 * AUSD
            )
        );
        // signed for 50, claimed for 49: the permit fails and there is no allowance
        line.repayWithPermit(49 * AUSD, block.timestamp + 1 hours, v, r, s);
    }

    function test_worksWhilePaused() public {
        vm.prank(admin);
        line.pause();
        (uint8 v, bytes32 r, bytes32 s) = _permit(50 * AUSD, block.timestamp + 1 hours);
        vm.prank(borrower);
        line.repayWithPermit(50 * AUSD, block.timestamp + 1 hours, v, r, s);
        assertEq(line.accountOf(borrower).drawn, 0);
    }

    function _permit(uint256 value, uint256 deadline)
        internal
        view
        returns (uint8, bytes32, bytes32)
    {
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256(
                    "Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"
                ),
                borrower,
                address(line),
                value,
                ausd.nonces(borrower),
                deadline
            )
        );
        return vm.sign(
            BORROWER_KEY,
            keccak256(abi.encodePacked("\x19\x01", ausd.DOMAIN_SEPARATOR(), structHash))
        );
    }
}
