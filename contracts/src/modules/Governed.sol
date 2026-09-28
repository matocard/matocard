// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {
    AccessControlDefaultAdminRulesUpgradeable
} from "@openzeppelin/contracts-upgradeable/access/extensions/AccessControlDefaultAdminRulesUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {
    PausableUpgradeable
} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";

import {IMatoCreditLine} from "../interfaces/IMatoCreditLine.sol";
import {Params} from "../types/CreditTypes.sol";

/// @title Governed
/// @notice Roles, pause, parameters and UUPS upgrades for the credit line.
/// @dev The admin hands over in two steps with a one-day delay, and is the only
///      role that can upgrade, pause or change parameters. The relayer and KYC
///      roles can never move funds out.
abstract contract Governed is
    IMatoCreditLine,
    AccessControlDefaultAdminRulesUpgradeable,
    PausableUpgradeable,
    UUPSUpgradeable
{
    bytes32 public constant KYC_ROLE = keccak256("KYC_ROLE");
    bytes32 public constant RELAYER_ROLE = keccak256("RELAYER_ROLE");

    uint48 internal constant ADMIN_DELAY = 1 days;
    uint256 internal constant BPS = 10_000;

    /// @custom:storage-location erc7201:matocard.storage.Governed
    struct GovernedStorage {
        Params params;
    }

    // keccak256(abi.encode(uint256(keccak256("matocard.storage.Governed")) - 1)) & ~bytes32(uint256(0xff))
    bytes32 private constant GOVERNED_STORAGE =
        0xecddb13aa040ba5562abb688ac7094131475a36cd3941313e6f95a6e75092300;

    function __Governed_init(address admin, Params memory p) internal onlyInitializing {
        __AccessControlDefaultAdminRules_init(ADMIN_DELAY, admin);
        __Pausable_init();
        _setParams(p);
    }

    function params() public view returns (Params memory) {
        return _governed().params;
    }

    function setParams(Params calldata p) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setParams(p);
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    function _authorizeUpgrade(address) internal override onlyRole(DEFAULT_ADMIN_ROLE) {}

    function _setParams(Params memory p) internal {
        if (p.term == 0 || p.minUtilizationBps > BPS || p.yieldFeeBps > BPS) revert BadParams();
        _governed().params = p;
        emit ParamsChanged(p);
    }

    function _governed() private pure returns (GovernedStorage storage $) {
        assembly {
            $.slot := GOVERNED_STORAGE
        }
    }
}
