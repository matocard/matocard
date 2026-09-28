// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {Test} from "forge-std/Test.sol";

import {MatoCreditLine} from "../../src/MatoCreditLine.sol";
import {MockEarnAUSD} from "../../src/testnet/MockEarnAUSD.sol";
import {TestAUSD} from "../../src/testnet/TestAUSD.sol";
import {DepositMethod, Params} from "../../src/types/CreditTypes.sol";

/// @dev The line exactly as it is deployed: an implementation behind an
///      ERC1967 proxy, initialised in the same transaction. Testnet parameters.
abstract contract Deployers is Test {
    uint256 internal constant AUSD = 1e6;
    uint256 internal constant LP_DEPOSIT = 10_000 * AUSD;

    TestAUSD internal ausd;
    MockEarnAUSD internal vault;
    MatoCreditLine internal line;

    address internal admin = makeAddr("admin");
    address internal kyc = makeAddr("kyc");
    address internal relayer = makeAddr("relayer");
    address internal lp = makeAddr("lp");
    address internal siti = makeAddr("siti");
    address internal mom = makeAddr("mom");
    address internal stranger = makeAddr("stranger");

    function setUp() public virtual {
        ausd = new TestAUSD();
        vault = new MockEarnAUSD(ausd);
        line = _deployLine(_testnetParams());

        vm.startPrank(admin);
        line.grantRole(line.KYC_ROLE(), kyc);
        line.grantRole(line.RELAYER_ROLE(), relayer);
        vm.stopPrank();

        ausd.mint(lp, LP_DEPOSIT);
        vm.startPrank(lp);
        ausd.approve(address(line), type(uint256).max);
        line.deposit(LP_DEPOSIT, lp);
        vm.stopPrank();

        ausd.mint(relayer, 1_000_000 * AUSD);
        vm.prank(relayer);
        ausd.approve(address(line), type(uint256).max);

        _verify(siti, "siti");
    }

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

    function _deployLine(Params memory p) internal returns (MatoCreditLine) {
        MatoCreditLine impl = new MatoCreditLine();
        bytes memory init = abi.encodeCall(MatoCreditLine.initialize, (ausd, vault, admin, p));
        return MatoCreditLine(address(new ERC1967Proxy(address(impl), init)));
    }

    function _verify(address who, string memory id) internal {
        vm.prank(kyc);
        line.setVerified(who, keccak256(bytes(id)));
    }

    function _topUp(address who, uint256 amount, DepositMethod method) internal {
        vm.prank(relayer);
        line.depositFor(who, amount, method);
    }

    function _draw(address who, uint256 amount) internal {
        vm.prank(who);
        line.draw(amount, mom);
    }

    function _repay(address who, uint256 amount) internal {
        ausd.mint(who, amount);
        vm.startPrank(who);
        ausd.approve(address(line), amount);
        line.repay(amount);
        vm.stopPrank();
    }
}
