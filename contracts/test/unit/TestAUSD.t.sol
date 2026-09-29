// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IERC1271} from "@openzeppelin/contracts/interfaces/IERC1271.sol";
import {Test} from "forge-std/Test.sol";

import {TestAUSD} from "../../src/testnet/TestAUSD.sol";

/// @dev Accepts exactly one digest, signed by its owner key, the way a smart
///      account would.
contract Erc1271Wallet is IERC1271 {
    address internal immutable owner;

    constructor(address owner_) {
        owner = owner_;
    }

    function isValidSignature(bytes32 hash, bytes memory signature) external view returns (bytes4) {
        (bytes32 r, bytes32 s) = abi.decode(signature, (bytes32, bytes32));
        uint8 v = uint8(signature[64]);
        return ecrecover(hash, v, r, s) == owner ? IERC1271.isValidSignature.selector : bytes4(0);
    }
}

contract TestAUSDTest is Test {
    TestAUSD internal token;

    uint256 internal sitiKey = 0xA11CE;
    address internal siti;
    address internal mom = makeAddr("mom");
    address internal relayer = makeAddr("relayer");

    uint256 internal constant AUSD = 1e6;

    function setUp() public {
        token = new TestAUSD();
        siti = vm.addr(sitiKey);
        token.mint(siti, 100 * AUSD);
    }

    // ---- the selectors AUSD on Monad testnet exposes, read from its bytecode ----

    function test_selectorsMatchAusd() public pure {
        assertEq(
            bytes4(
                keccak256(
                    "transferWithAuthorization(address,address,uint256,uint256,uint256,bytes32,uint8,bytes32,bytes32)"
                )
            ),
            bytes4(0xe3ee160e)
        );
        assertEq(
            bytes4(
                keccak256(
                    "transferWithAuthorization(address,address,uint256,uint256,uint256,bytes32,bytes)"
                )
            ),
            bytes4(0xcf092995)
        );
        assertEq(
            bytes4(
                keccak256(
                    "receiveWithAuthorization(address,address,uint256,uint256,uint256,bytes32,uint8,bytes32,bytes32)"
                )
            ),
            bytes4(0xef55bec6)
        );
        assertEq(
            bytes4(
                keccak256(
                    "receiveWithAuthorization(address,address,uint256,uint256,uint256,bytes32,bytes)"
                )
            ),
            bytes4(0x88b7ab63)
        );
        assertEq(
            bytes4(keccak256("cancelAuthorization(address,bytes32,uint8,bytes32,bytes32)")),
            bytes4(0x5a049a70)
        );
        assertEq(
            bytes4(keccak256("cancelAuthorization(address,bytes32,bytes)")), bytes4(0xb7b72899)
        );
        assertEq(bytes4(keccak256("authorizationState(address,bytes32)")), bytes4(0xe94a0102));
        assertEq(
            bytes4(keccak256("permit(address,address,uint256,uint256,uint8,bytes32,bytes32)")),
            bytes4(0xd505accf)
        );
        assertEq(bytes4(keccak256("eip712Domain()")), bytes4(0x84b0196e));
    }

    // ---- permit ----

    function test_permit() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 digest = _digest(
            keccak256(
                abi.encode(
                    keccak256(
                        "Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"
                    ),
                    siti,
                    relayer,
                    10 * AUSD,
                    token.nonces(siti),
                    deadline
                )
            )
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(sitiKey, digest);
        token.permit(siti, relayer, 10 * AUSD, deadline, v, r, s);
        assertEq(token.allowance(siti, relayer), 10 * AUSD);
    }

    // ---- transferWithAuthorization ----

    function test_relayerSubmitsASignedTransfer() public {
        (uint8 v, bytes32 r, bytes32 s) = _signTransfer(mom, 30 * AUSD, bytes32("n1"));
        vm.prank(relayer);
        token.transferWithAuthorization(siti, mom, 30 * AUSD, 0, _later(), bytes32("n1"), v, r, s);
        assertEq(token.balanceOf(mom), 30 * AUSD);
        assertTrue(token.authorizationState(siti, bytes32("n1")));
    }

    function test_bytesSignatureForm() public {
        (uint8 v, bytes32 r, bytes32 s) = _signTransfer(mom, 30 * AUSD, bytes32("n1"));
        token.transferWithAuthorization(
            siti, mom, 30 * AUSD, 0, _later(), bytes32("n1"), abi.encodePacked(r, s, v)
        );
        assertEq(token.balanceOf(mom), 30 * AUSD);
    }

    function test_replayIsRefused() public {
        (uint8 v, bytes32 r, bytes32 s) = _signTransfer(mom, 30 * AUSD, bytes32("n1"));
        token.transferWithAuthorization(siti, mom, 30 * AUSD, 0, _later(), bytes32("n1"), v, r, s);
        vm.expectRevert(TestAUSD.AuthorizationAlreadyUsed.selector);
        token.transferWithAuthorization(siti, mom, 30 * AUSD, 0, _later(), bytes32("n1"), v, r, s);
    }

    function test_expiredIsRefused() public {
        uint256 validBefore = vm.getBlockTimestamp() + 10;
        (uint8 v, bytes32 r, bytes32 s) = _sign(
            token.TRANSFER_WITH_AUTHORIZATION_TYPEHASH(),
            mom,
            30 * AUSD,
            0,
            validBefore,
            bytes32("n1")
        );
        vm.warp(validBefore);
        vm.expectRevert(TestAUSD.AuthorizationExpired.selector);
        token.transferWithAuthorization(
            siti, mom, 30 * AUSD, 0, validBefore, bytes32("n1"), v, r, s
        );
    }

    function test_notYetValidIsRefused() public {
        uint256 validAfter = block.timestamp + 100;
        (uint8 v, bytes32 r, bytes32 s) = _sign(
            token.TRANSFER_WITH_AUTHORIZATION_TYPEHASH(),
            mom,
            30 * AUSD,
            validAfter,
            _later(),
            bytes32("n1")
        );
        vm.expectRevert(TestAUSD.AuthorizationNotYetValid.selector);
        token.transferWithAuthorization(
            siti, mom, 30 * AUSD, validAfter, _later(), bytes32("n1"), v, r, s
        );
    }

    function test_changedAmountOrWrongSignerIsRefused() public {
        (uint8 v, bytes32 r, bytes32 s) = _signTransfer(mom, 30 * AUSD, bytes32("n1"));
        vm.expectRevert(TestAUSD.InvalidAuthorizationSignature.selector);
        token.transferWithAuthorization(siti, mom, 31 * AUSD, 0, _later(), bytes32("n1"), v, r, s);

        vm.expectRevert(TestAUSD.InvalidAuthorizationSignature.selector);
        token.transferWithAuthorization(mom, siti, 30 * AUSD, 0, _later(), bytes32("n1"), v, r, s);
    }

    // ---- receiveWithAuthorization ----

    function test_receiveOnlyByThePayee() public {
        (uint8 v, bytes32 r, bytes32 s) = _sign(
            token.RECEIVE_WITH_AUTHORIZATION_TYPEHASH(), mom, 30 * AUSD, 0, _later(), bytes32("n1")
        );
        vm.prank(relayer);
        vm.expectRevert(TestAUSD.CallerMustBePayee.selector);
        token.receiveWithAuthorization(siti, mom, 30 * AUSD, 0, _later(), bytes32("n1"), v, r, s);

        vm.prank(mom);
        token.receiveWithAuthorization(siti, mom, 30 * AUSD, 0, _later(), bytes32("n1"), v, r, s);
        assertEq(token.balanceOf(mom), 30 * AUSD);
    }

    function test_aTransferSignatureCannotBeUsedAsAReceive() public {
        (uint8 v, bytes32 r, bytes32 s) = _signTransfer(mom, 30 * AUSD, bytes32("n1"));
        vm.prank(mom);
        vm.expectRevert(TestAUSD.InvalidAuthorizationSignature.selector);
        token.receiveWithAuthorization(siti, mom, 30 * AUSD, 0, _later(), bytes32("n1"), v, r, s);
    }

    // ---- cancelAuthorization ----

    function test_cancelledAuthorizationCannotBeUsed() public {
        bytes32 nonce = bytes32("n1");
        (uint8 v, bytes32 r, bytes32 s) = _signTransfer(mom, 30 * AUSD, nonce);
        (uint8 cv, bytes32 cr, bytes32 cs) = vm.sign(
            sitiKey,
            _digest(keccak256(abi.encode(token.CANCEL_AUTHORIZATION_TYPEHASH(), siti, nonce)))
        );
        token.cancelAuthorization(siti, nonce, cv, cr, cs);

        vm.expectRevert(TestAUSD.AuthorizationAlreadyUsed.selector);
        token.transferWithAuthorization(siti, mom, 30 * AUSD, 0, _later(), nonce, v, r, s);
        vm.expectRevert(TestAUSD.AuthorizationAlreadyUsed.selector);
        token.cancelAuthorization(siti, nonce, cv, cr, cs);
    }

    function test_cancelNeedsTheAuthorizersSignature() public {
        (uint8 cv, bytes32 cr, bytes32 cs) = vm.sign(
            0xB0B,
            _digest(
                keccak256(abi.encode(token.CANCEL_AUTHORIZATION_TYPEHASH(), siti, bytes32("n1")))
            )
        );
        vm.expectRevert(TestAUSD.InvalidAuthorizationSignature.selector);
        token.cancelAuthorization(siti, bytes32("n1"), cv, cr, cs);
    }

    function test_bytesFormsOfReceiveAndCancel() public {
        (uint8 v, bytes32 r, bytes32 s) = _sign(
            token.RECEIVE_WITH_AUTHORIZATION_TYPEHASH(), mom, 30 * AUSD, 0, _later(), bytes32("n1")
        );
        vm.prank(mom);
        token.receiveWithAuthorization(
            siti, mom, 30 * AUSD, 0, _later(), bytes32("n1"), abi.encodePacked(r, s, v)
        );
        assertEq(token.balanceOf(mom), 30 * AUSD);

        (uint8 cv, bytes32 cr, bytes32 cs) = vm.sign(
            sitiKey,
            _digest(
                keccak256(abi.encode(token.CANCEL_AUTHORIZATION_TYPEHASH(), siti, bytes32("n2")))
            )
        );
        token.cancelAuthorization(siti, bytes32("n2"), abi.encodePacked(cr, cs, cv));
        assertTrue(token.authorizationState(siti, bytes32("n2")));
    }

    // ---- contract wallets ----

    function test_contractWalletSignsThroughErc1271() public {
        Erc1271Wallet wallet = new Erc1271Wallet(siti);
        token.mint(address(wallet), 50 * AUSD);
        bytes32 digest = _digest(
            keccak256(
                abi.encode(
                    token.TRANSFER_WITH_AUTHORIZATION_TYPEHASH(),
                    address(wallet),
                    mom,
                    20 * AUSD,
                    0,
                    _later(),
                    bytes32("w1")
                )
            )
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(sitiKey, digest);
        token.transferWithAuthorization(
            address(wallet), mom, 20 * AUSD, 0, _later(), bytes32("w1"), abi.encodePacked(r, s, v)
        );
        assertEq(token.balanceOf(mom), 20 * AUSD);
    }

    // ---- helpers ----

    function _later() internal view returns (uint256) {
        return block.timestamp + 1 hours;
    }

    function _signTransfer(address to, uint256 value, bytes32 nonce)
        internal
        view
        returns (uint8, bytes32, bytes32)
    {
        return _sign(token.TRANSFER_WITH_AUTHORIZATION_TYPEHASH(), to, value, 0, _later(), nonce);
    }

    function _sign(
        bytes32 typehash,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce
    ) internal view returns (uint8, bytes32, bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(typehash, siti, to, value, validAfter, validBefore, nonce)
        );
        return vm.sign(sitiKey, _digest(structHash));
    }

    function _digest(bytes32 structHash) internal view returns (bytes32) {
        return keccak256(abi.encodePacked("\x19\x01", token.DOMAIN_SEPARATOR(), structHash));
    }
}
