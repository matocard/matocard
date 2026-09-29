// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";

/// @title TestAUSD
/// @notice A labelled stand-in for AUSD on testnet, used only if no AUSD faucet
///         exists. Six decimals like the real token. Anyone can mint: it is
///         worth nothing and says so in its name.
/// @dev Implements the parts of AUSD's interface an app relies on, so the same
///      app code runs against either token: ERC-2612 `permit` and ERC-3009
///      `transferWithAuthorization` / `receiveWithAuthorization` /
///      `cancelAuthorization`, each authorization in both the (v, r, s) and the
///      `bytes signature` form. The bytes form also accepts ERC-1271 contract
///      wallets.
contract TestAUSD is ERC20, ERC20Permit {
    bytes32 public constant TRANSFER_WITH_AUTHORIZATION_TYPEHASH = keccak256(
        "TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
    );
    bytes32 public constant RECEIVE_WITH_AUTHORIZATION_TYPEHASH = keccak256(
        "ReceiveWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
    );
    bytes32 public constant CANCEL_AUTHORIZATION_TYPEHASH =
        keccak256("CancelAuthorization(address authorizer,bytes32 nonce)");

    mapping(address authorizer => mapping(bytes32 nonce => bool used)) public authorizationState;

    event AuthorizationUsed(address indexed authorizer, bytes32 indexed nonce);
    event AuthorizationCanceled(address indexed authorizer, bytes32 indexed nonce);

    error AuthorizationNotYetValid();
    error AuthorizationExpired();
    error AuthorizationAlreadyUsed();
    error InvalidAuthorizationSignature();
    error CallerMustBePayee();

    constructor() ERC20("Test AUSD (no value)", "tAUSD") ERC20Permit("Test AUSD (no value)") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    // ------------------------------------------------------------ ERC-3009

    function transferWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        transferWithAuthorization(
            from, to, value, validAfter, validBefore, nonce, abi.encodePacked(r, s, v)
        );
    }

    function transferWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        bytes memory signature
    ) public {
        _useAuthorization(
            TRANSFER_WITH_AUTHORIZATION_TYPEHASH,
            from,
            to,
            value,
            validAfter,
            validBefore,
            nonce,
            signature
        );
        _transfer(from, to, value);
    }

    function receiveWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        receiveWithAuthorization(
            from, to, value, validAfter, validBefore, nonce, abi.encodePacked(r, s, v)
        );
    }

    /// @dev Only the payee may submit it, so a watcher cannot front-run the
    ///      payee's own contract call with the same authorization.
    function receiveWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        bytes memory signature
    ) public {
        if (msg.sender != to) revert CallerMustBePayee();
        _useAuthorization(
            RECEIVE_WITH_AUTHORIZATION_TYPEHASH,
            from,
            to,
            value,
            validAfter,
            validBefore,
            nonce,
            signature
        );
        _transfer(from, to, value);
    }

    function cancelAuthorization(address authorizer, bytes32 nonce, uint8 v, bytes32 r, bytes32 s)
        external
    {
        cancelAuthorization(authorizer, nonce, abi.encodePacked(r, s, v));
    }

    function cancelAuthorization(address authorizer, bytes32 nonce, bytes memory signature) public {
        if (authorizationState[authorizer][nonce]) revert AuthorizationAlreadyUsed();
        bytes32 digest = _hashTypedDataV4(
            keccak256(abi.encode(CANCEL_AUTHORIZATION_TYPEHASH, authorizer, nonce))
        );
        _checkSignature(authorizer, digest, signature);
        authorizationState[authorizer][nonce] = true;
        emit AuthorizationCanceled(authorizer, nonce);
    }

    function _useAuthorization(
        bytes32 typehash,
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        bytes memory signature
    ) internal {
        if (block.timestamp <= validAfter) revert AuthorizationNotYetValid();
        if (block.timestamp >= validBefore) revert AuthorizationExpired();
        if (authorizationState[from][nonce]) revert AuthorizationAlreadyUsed();

        bytes32 digest = _hashTypedDataV4(
            keccak256(abi.encode(typehash, from, to, value, validAfter, validBefore, nonce))
        );
        _checkSignature(from, digest, signature);

        authorizationState[from][nonce] = true;
        emit AuthorizationUsed(from, nonce);
    }

    function _checkSignature(address signer, bytes32 digest, bytes memory signature) internal view {
        if (!SignatureChecker.isValidSignatureNow(signer, digest, signature)) {
            revert InvalidAuthorizationSignature();
        }
    }
}
