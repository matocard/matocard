// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Governed} from "./Governed.sol";

/// @title IdentityModule
/// @notice One verified identity, one wallet, in both directions.
/// @dev Without this a defaulter opens a fresh wallet and the record means
///      nothing. Only a hash of the identity is stored.
abstract contract IdentityModule is Governed {
    /// @custom:storage-location erc7201:matocard.storage.Identity
    struct IdentityStorage {
        mapping(address => bytes32) identityOf;
        mapping(bytes32 => address) walletOfIdentity;
    }

    // keccak256(abi.encode(uint256(keccak256("matocard.storage.Identity")) - 1)) & ~bytes32(uint256(0xff))
    bytes32 private constant IDENTITY_STORAGE =
        0x2b2fd1ad36326307927d72b2d60b83819b7772c4f624b6568486bc9d15f69b00;

    function setVerified(address wallet, bytes32 identityHash) external onlyRole(KYC_ROLE) {
        IdentityStorage storage $ = _identity();
        if (wallet == address(0)) revert ZeroAddress();
        if (identityHash == bytes32(0)) revert ZeroAmount();
        if ($.identityOf[wallet] != bytes32(0)) revert AlreadyVerified(wallet);
        if ($.walletOfIdentity[identityHash] != address(0)) revert IdentityTaken(identityHash);
        $.identityOf[wallet] = identityHash;
        $.walletOfIdentity[identityHash] = wallet;
        emit Verified(wallet, identityHash);
    }

    function identityOf(address wallet) external view returns (bytes32) {
        return _identity().identityOf[wallet];
    }

    function walletOfIdentity(bytes32 identityHash) external view returns (address) {
        return _identity().walletOfIdentity[identityHash];
    }

    function isVerified(address wallet) public view returns (bool) {
        return _identity().identityOf[wallet] != bytes32(0);
    }

    function _requireVerified(address wallet) internal view {
        if (!isVerified(wallet)) revert NotVerified(wallet);
    }

    function _identity() private pure returns (IdentityStorage storage $) {
        assembly {
            $.slot := IDENTITY_STORAGE
        }
    }
}
