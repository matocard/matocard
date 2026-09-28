// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Script, console} from "forge-std/Script.sol";

import {MatoCreditLine} from "../src/MatoCreditLine.sol";
import {MockEarnAUSD} from "../src/testnet/MockEarnAUSD.sol";
import {TestAUSD} from "../src/testnet/TestAUSD.sol";
import {Params} from "../src/types/CreditTypes.sol";

/// @notice Deploys the credit line to Monad testnet.
///
/// Env:
///   WALLET_PK      deployer; becomes admin, and holds KYC + relayer roles until
///                  the services have keys of their own
///   AUSD_ADDRESS   optional. Unset: deploys TestAUSD and seeds the pool with it
///   POOL_SEED      optional, whole tokens, default 100000 (TestAUSD only)
contract DeployMatoCreditLine is Script {
    function run() external {
        uint256 pk = vm.envUint("WALLET_PK");
        address deployer = vm.addr(pk);
        address ausdAddress = vm.envOr("AUSD_ADDRESS", address(0));
        uint256 seed = vm.envOr("POOL_SEED", uint256(100_000)) * 1e6;

        vm.startBroadcast(pk);

        bool testToken = ausdAddress == address(0);
        IERC20 ausd = testToken ? IERC20(address(new TestAUSD())) : IERC20(ausdAddress);
        MockEarnAUSD vault = new MockEarnAUSD(ausd);

        MatoCreditLine impl = new MatoCreditLine();
        bytes memory init =
            abi.encodeCall(MatoCreditLine.initialize, (ausd, vault, deployer, _testnetParams()));
        MatoCreditLine line = MatoCreditLine(address(new ERC1967Proxy(address(impl), init)));

        line.grantRole(line.KYC_ROLE(), deployer);
        line.grantRole(line.RELAYER_ROLE(), deployer);

        if (testToken) {
            TestAUSD(address(ausd)).mint(deployer, seed);
            ausd.approve(address(line), seed);
            line.deposit(seed, deployer);
        }

        vm.stopBroadcast();

        console.log("AUSD            ", address(ausd), testToken ? "(TestAUSD)" : "");
        console.log("MockEarnAUSD    ", address(vault));
        console.log("MatoCreditLine  ", address(line), "(proxy)");
        console.log("implementation  ", address(impl));
    }

    /// @dev PLAN §6.2 testnet values: one-minute holds and cycles so the demo
    ///      runs live; production raises both to seven days.
    function _testnetParams() internal pure returns (Params memory) {
        return Params({
            term: 30 days,
            grace: 3 days,
            minCycleDuration: 60,
            cardHold: 60,
            minUtilizationBps: 1_000,
            yieldFeeBps: 2_000
        });
    }
}
