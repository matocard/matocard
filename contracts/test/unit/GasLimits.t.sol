// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {DepositMethod} from "../../src/types/CreditTypes.sol";
import {Deployers} from "../helpers/Deployers.sol";

/// @dev Each call in its heaviest shape stays under the limit the app and
///      relayer are told to send (packages/contracts/src/gas-limits.json).
///
///      The limits come from Monad's own estimates, and Monad prices cold
///      storage above this local EVM, so this is a loose bound: it catches a
///      change that makes a call much heavier, not a few percent. Re-measure on
///      testnet after changing a hot path.
contract GasLimitsTest is Deployers {
    string internal limits;

    function setUp() public override {
        super.setUp();
        limits = vm.readFile("../packages/contracts/src/gas-limits.json");
    }

    function _limit(string memory name) internal view returns (uint256) {
        return vm.parseJsonUint(limits, string.concat(".", name));
    }

    function _check(string memory name, uint256 used) internal view {
        assertLt(used, _limit(name), name);
    }

    function test_setVerified() public {
        vm.prank(kyc);
        uint256 g = gasleft();
        line.setVerified(stranger, keccak256("fresh"));
        _check("setVerified", g - gasleft());
    }

    /// @dev Card top-up with yield waiting to be charged and a matured hold to settle.
    function test_depositFor() public {
        _topUp(siti, 100 * AUSD, DepositMethod.Card);
        skip(60);
        _yield(50 * AUSD);
        vm.prank(relayer);
        uint256 g = gasleft();
        line.depositFor(siti, 50 * AUSD, DepositMethod.Card);
        _check("depositFor", g - gasleft());
    }

    function test_cancelPending() public {
        _topUp(siti, 100 * AUSD, DepositMethod.Card);
        uint256 shares = line.collateralOf(siti).pendingShares;
        vm.prank(relayer);
        uint256 g = gasleft();
        line.cancelPending(siti, shares);
        _check("cancelPending", g - gasleft());
    }

    /// @dev First draw of a cycle, settling a matured card top-up on the way.
    function test_draw() public {
        _topUp(siti, 150 * AUSD, DepositMethod.Card);
        skip(60);
        vm.prank(siti);
        uint256 g = gasleft();
        line.draw(50 * AUSD, mom);
        _check("draw", g - gasleft());
    }

    /// @dev The repayment that closes a qualifying cycle.
    function test_repayAndRepayFor() public {
        _topUp(siti, 150 * AUSD, DepositMethod.Bank);
        _draw(siti, 50 * AUSD);
        skip(61);
        ausd.mint(siti, 50 * AUSD);
        vm.startPrank(siti);
        ausd.approve(address(line), 50 * AUSD);
        uint256 g = gasleft();
        line.repay(50 * AUSD);
        uint256 used = g - gasleft();
        vm.stopPrank();
        _check("repay", used);
        _check("repayFor", used);
    }

    function test_repayWithPermit() public {
        uint256 key = 0xB0770;
        address borrower = vm.addr(key);
        _verify(borrower, "gas permit borrower");
        _topUp(borrower, 150 * AUSD, DepositMethod.Bank);
        _draw(borrower, 50 * AUSD);
        skip(61);
        ausd.mint(borrower, 50 * AUSD);
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256(
                    "Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"
                ),
                borrower,
                address(line),
                50 * AUSD,
                ausd.nonces(borrower),
                deadline
            )
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(
            key, keccak256(abi.encodePacked("\x19\x01", ausd.DOMAIN_SEPARATOR(), structHash))
        );
        vm.prank(borrower);
        uint256 g = gasleft();
        line.repayWithPermit(50 * AUSD, deadline, v, r, s);
        _check("repayWithPermit", g - gasleft());
    }

    /// @dev The relayer submitting a user's ERC-3009 send, to a fresh recipient.
    function test_transferWithAuthorization() public {
        uint256 key = 0x5E4D;
        address sender = vm.addr(key);
        ausd.mint(sender, 10 * AUSD);
        uint256 validBefore = block.timestamp + 1 hours;
        bytes32 structHash = keccak256(
            abi.encode(
                ausd.TRANSFER_WITH_AUTHORIZATION_TYPEHASH(),
                sender,
                stranger,
                10 * AUSD,
                0,
                validBefore,
                bytes32("gas")
            )
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(
            key, keccak256(abi.encodePacked("\x19\x01", ausd.DOMAIN_SEPARATOR(), structHash))
        );
        vm.prank(relayer);
        uint256 g = gasleft();
        ausd.transferWithAuthorization(
            sender, stranger, 10 * AUSD, 0, validBefore, bytes32("gas"), abi.encodePacked(r, s, v)
        );
        _check("transferWithAuthorization", g - gasleft());
    }

    function test_repayFromCollateral() public {
        _topUp(siti, 150 * AUSD, DepositMethod.Bank);
        _draw(siti, 50 * AUSD);
        skip(61);
        _yield(20 * AUSD);
        vm.prank(siti);
        uint256 g = gasleft();
        line.repayFromCollateral(50 * AUSD);
        _check("repayFromCollateral", g - gasleft());
    }

    function test_withdrawCollateral() public {
        _topUp(siti, 150 * AUSD, DepositMethod.Bank);
        _yield(20 * AUSD);
        vm.prank(siti);
        uint256 g = gasleft();
        line.withdrawCollateral(10 * AUSD);
        _check("withdrawCollateral", g - gasleft());
    }

    function test_lenderDepositAndRedeem() public {
        address fresh = makeAddr("fresh lender");
        ausd.mint(fresh, 1_000 * AUSD);
        vm.startPrank(fresh);
        ausd.approve(address(line), 1_000 * AUSD);
        uint256 g = gasleft();
        line.deposit(1_000 * AUSD, fresh);
        _check("deposit", g - gasleft());
        uint256 shares = line.balanceOf(fresh);
        g = gasleft();
        line.redeem(shares, fresh, fresh);
        _check("redeem", g - gasleft());
        vm.stopPrank();
    }

    function test_approve() public {
        vm.prank(stranger);
        uint256 g = gasleft();
        ausd.approve(address(line), 1);
        _check("approve", g - gasleft());
    }

    /// @dev Every limit in the file has a test here, so none goes unchecked.
    function test_everyLimitIsExercised() public view {
        string[13] memory names = [
            "setVerified",
            "depositFor",
            "cancelPending",
            "draw",
            "repay",
            "repayFor",
            "repayWithPermit",
            "repayFromCollateral",
            "withdrawCollateral",
            "deposit",
            "redeem",
            "approve",
            "transferWithAuthorization"
        ];
        assertEq(vm.parseJsonKeys(limits, "$").length, names.length);
        for (uint256 i; i < names.length; ++i) {
            assertGt(_limit(names[i]), 0, names[i]);
        }
    }

    function _yield(uint256 amount) internal {
        ausd.mint(address(this), amount);
        ausd.approve(address(vault), amount);
        vault.distribute(amount);
    }
}
