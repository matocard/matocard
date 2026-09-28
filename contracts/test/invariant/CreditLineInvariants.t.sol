// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";

import {MatoCreditLine} from "../../src/MatoCreditLine.sol";
import {MockEarnAUSD} from "../../src/testnet/MockEarnAUSD.sol";
import {TestAUSD} from "../../src/testnet/TestAUSD.sol";
import {Collateral, DepositMethod} from "../../src/types/CreditTypes.sol";
import {Deployers} from "../helpers/Deployers.sol";

/// @dev Drives the line with bounded, mostly-valid actions from three borrowers.
contract Handler is Test {
    MatoCreditLine internal line;
    TestAUSD internal ausd;
    MockEarnAUSD internal vault;
    address internal relayer;
    address[] public actors;

    constructor(
        MatoCreditLine line_,
        TestAUSD ausd_,
        MockEarnAUSD vault_,
        address relayer_,
        address[] memory actors_
    ) {
        line = line_;
        ausd = ausd_;
        vault = vault_;
        relayer = relayer_;
        actors = actors_;
    }

    function topUp(uint256 who, uint256 amount, bool card) external {
        amount = bound(amount, 1e6, 5_000e6);
        vm.prank(relayer);
        line.depositFor(_actor(who), amount, card ? DepositMethod.Card : DepositMethod.Bank);
    }

    function cancel(uint256 who, uint256 shares) external {
        address a = _actor(who);
        uint256 pending = line.collateralOf(a).pendingShares;
        if (pending == 0) return;
        vm.prank(relayer);
        try line.cancelPending(a, bound(shares, 1, pending)) {} catch {}
    }

    function draw(uint256 who, uint256 amount) external {
        address a = _actor(who);
        uint256 available = line.availableOf(a);
        if (available == 0) return;
        vm.prank(a);
        line.draw(bound(amount, 1, available), address(0xBEEF));
    }

    function repay(uint256 who, uint256 amount) external {
        address a = _actor(who);
        uint256 owed = line.accountOf(a).drawn;
        if (owed == 0) return;
        amount = bound(amount, 1, owed);
        ausd.mint(a, amount);
        vm.startPrank(a);
        ausd.approve(address(line), amount);
        line.repay(amount);
        vm.stopPrank();
    }

    function repayFromCollateral(uint256 who, uint256 amount) external {
        address a = _actor(who);
        uint256 owed = line.accountOf(a).drawn;
        if (owed == 0) return;
        vm.prank(a);
        try line.repayFromCollateral(bound(amount, 1, owed)) {} catch {}
    }

    function withdraw(uint256 who, uint256 shares) external {
        address a = _actor(who);
        line.settlePending(a);
        uint256 held = line.collateralOf(a).shares;
        if (held == 0) return;
        vm.prank(a);
        try line.withdrawCollateral(bound(shares, 1, held)) {} catch {}
    }

    function markDefaulted(uint256 who) external {
        try line.markDefaulted(_actor(who)) {} catch {}
    }

    function yield(uint256 amount) external {
        amount = bound(amount, 1e6, 500e6);
        ausd.mint(address(this), amount);
        ausd.approve(address(vault), amount);
        vault.distribute(amount);
    }

    function warp(uint256 secs) external {
        vm.warp(block.timestamp + bound(secs, 1, 20 days));
    }

    function actorCount() external view returns (uint256) {
        return actors.length;
    }

    function _actor(uint256 i) internal view returns (address) {
        return actors[i % actors.length];
    }
}

contract CreditLineInvariants is Deployers {
    Handler internal handler;
    address[] internal borrowers;

    function setUp() public override {
        super.setUp();
        borrowers.push(siti);
        borrowers.push(makeAddr("ayu"));
        borrowers.push(makeAddr("budi"));
        _verify(borrowers[1], "ayu");
        _verify(borrowers[2], "budi");

        handler = new Handler(line, ausd, vault, relayer, borrowers);
        targetContract(address(handler));
    }

    /// @notice Every vault share the line holds belongs to a borrower or the pool.
    function invariant_vaultSharesAreFullyAssigned() public view {
        uint256 sum = line.poolShares();
        for (uint256 i; i < borrowers.length; ++i) {
            Collateral memory c = line.collateralOf(borrowers[i]);
            sum += c.shares + c.pendingShares;
        }
        assertEq(vault.balanceOf(address(line)), sum);
    }

    function invariant_totalDrawnIsTheSumOfDebts() public view {
        uint256 sum;
        for (uint256 i; i < borrowers.length; ++i) {
            sum += line.accountOf(borrowers[i]).drawn;
        }
        assertEq(line.totalDrawn(), sum);
    }

    /// @notice The pool's idle AUSD is really in the contract.
    function invariant_idleIsBacked() public view {
        assertGe(ausd.balanceOf(address(line)), line.idle());
    }

    function invariant_scoreStaysInRange() public view {
        for (uint256 i; i < borrowers.length; ++i) {
            assertLe(line.scoreOf(borrowers[i]), 100);
        }
    }
}
