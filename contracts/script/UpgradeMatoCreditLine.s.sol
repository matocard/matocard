// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Script, console} from "forge-std/Script.sol";

import {MatoCreditLine} from "../src/MatoCreditLine.sol";

/// @notice Deploys a new implementation and points the proxy at it.
///
/// Env:
///   WALLET_PK    the admin
///   PROXY        the MatoCreditLine proxy
contract UpgradeMatoCreditLine is Script {
    function run() external {
        uint256 pk = vm.envUint("WALLET_PK");
        MatoCreditLine line = MatoCreditLine(vm.envAddress("PROXY"));

        vm.startBroadcast(pk);
        MatoCreditLine impl = new MatoCreditLine();
        line.upgradeToAndCall(address(impl), "");
        vm.stopBroadcast();

        console.log("MatoCreditLine  ", address(line), "(proxy)");
        console.log("implementation  ", address(impl));
    }
}
