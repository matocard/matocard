// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title TestAUSD
/// @notice A labelled stand-in for AUSD on testnet, used only if no AUSD faucet
///         exists. Six decimals like the real token. Anyone can mint: it is
///         worth nothing and says so in its name.
contract TestAUSD is ERC20 {
    constructor() ERC20("Test AUSD (no value)", "tAUSD") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
