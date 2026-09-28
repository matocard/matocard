// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title MockEarnAUSD
/// @notice Testnet stand-in for earnAUSD: an ERC4626 vault over AUSD whose
///         share price rises when yield is paid into it.
/// @dev Yield is whatever AUSD someone sends through `distribute`, so the demo
///      APY is set by how much the operator drips in. Withdrawals are instant,
///      unlike earnAUSD's queue of up to 72 hours.
contract MockEarnAUSD is ERC4626 {
    using SafeERC20 for IERC20;

    event YieldDistributed(address indexed from, uint256 assets);

    constructor(IERC20 ausd) ERC20("Mock earnAUSD", "mEarnAUSD") ERC4626(ausd) {}

    /// @notice Pays `assets` of AUSD into the vault as yield for every holder.
    function distribute(uint256 assets) external {
        IERC20(asset()).safeTransferFrom(msg.sender, address(this), assets);
        emit YieldDistributed(msg.sender, assets);
    }
}
