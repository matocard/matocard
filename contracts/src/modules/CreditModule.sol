// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";

import {CreditScoring} from "../libraries/CreditScoring.sol";
import {CreditAccount, Collateral, Params} from "../types/CreditTypes.sol";
import {CollateralModule} from "./CollateralModule.sol";

/// @title CreditModule
/// @notice Draw, repay, and default: the borrower's side of the line.
/// @dev A cycle opens on the first draw from zero and closes when the balance
///      returns to zero. Only a qualifying close raises the score (see
///      `_closeCycle`), so a record cannot be farmed with tiny or instant loops.
abstract contract CreditModule is CollateralModule {
    using SafeERC20 for IERC20;

    /// @custom:storage-location erc7201:matocard.storage.Credit
    struct CreditStorage {
        mapping(address => CreditAccount) accounts;
    }

    // keccak256(abi.encode(uint256(keccak256("matocard.storage.Credit")) - 1)) & ~bytes32(uint256(0xff))
    bytes32 private constant CREDIT_STORAGE =
        0x672b687690eb5300e6ac2b9086f8f67ad427ef12e1c0376293cf5fab7c14fb00;

    /// @notice Draws AUSD against the limit and pays it to `to` (a family
    ///         member's account, the payout treasury, or a merchant).
    function draw(uint256 amount, address to) external nonReentrant whenNotPaused {
        if (amount == 0) revert ZeroAmount();
        if (to == address(0)) revert ZeroAddress();
        _requireVerified(msg.sender);
        CreditAccount storage a = _accountOf(msg.sender);
        if (a.defaulted) revert AccountInDefault(msg.sender);

        Collateral storage c = _collateralOf(msg.sender);
        _settlePending(msg.sender, c);
        uint256 ceiling = CreditScoring.limit(_value(c), _score(a));
        uint256 headroom = ceiling > a.drawn ? ceiling - a.drawn : 0;
        if (amount > headroom) revert ExceedsLimit(amount, headroom);
        PoolStorage storage pool = _pool();
        if (amount > pool.idle) revert InsufficientLiquidity(amount, pool.idle);

        if (a.drawn == 0) {
            Params memory p = params();
            a.drawnAt = SafeCast.toUint64(block.timestamp);
            a.dueAt = a.drawnAt + p.term;
            a.defaultableAt = a.dueAt + p.grace;
            a.cycleMinDuration = p.minCycleDuration;
            a.cycleMinUtilizationBps = p.minUtilizationBps;
            a.limitAtDraw = ceiling;
        }
        a.drawn += amount;
        if (a.drawn > a.peakDrawn) a.peakDrawn = a.drawn;
        pool.totalDrawn += amount;
        pool.idle -= amount;

        emit Drawn(msg.sender, to, amount, a.drawn);
        IERC20(asset()).safeTransfer(to, amount);
    }

    /// @notice Repays the caller's own balance. Anything above it is not taken.
    /// @dev Never pausable: a pause must not push anyone into default.
    function repay(uint256 amount) external nonReentrant {
        _repay(msg.sender, msg.sender, amount);
    }

    /// @notice Repays someone else's balance, e.g. the relayer after a fiat
    ///         settlement. Paying another person's debt can only help them.
    function repayFor(address account, uint256 amount) external nonReentrant {
        _repay(account, msg.sender, amount);
    }

    /// @notice Settles from collateral instead of new money.
    function repayFromCollateral(uint256 amount) external nonReentrant {
        CreditAccount storage a = _accountOf(msg.sender);
        if (a.drawn == 0) revert NothingOwed();
        amount = Math.min(amount, a.drawn);
        if (amount == 0) revert ZeroAmount();

        Collateral storage c = _prepareCollateral(msg.sender);
        // reverts the whole call if the burn exceeds this borrower's shares
        _removeShares(c, yieldVault().withdraw(amount, address(this), address(this)));

        _pool().idle += amount;
        _reduceDebt(msg.sender, a, amount);
        emit Repaid(msg.sender, address(this), amount, a.drawn);
    }

    /// @notice Takes collateral back as AUSD, as long as the limit still covers
    ///         what is owed.
    function withdrawCollateral(uint256 shares) external nonReentrant whenNotPaused {
        if (shares == 0) revert ZeroAmount();
        Collateral storage c = _prepareCollateral(msg.sender);
        _removeShares(c, shares);
        CreditAccount storage a = _accountOf(msg.sender);
        if (a.drawn > CreditScoring.limit(_value(c), _score(a))) revert OverLimitAfterWithdrawal();

        uint256 assets = yieldVault().redeem(shares, msg.sender, address(this));
        emit CollateralWithdrawn(msg.sender, shares, assets);
    }

    /// @notice Closes an overdue position against its collateral. Anyone can
    ///         call it once the grace period has passed.
    /// @dev Seizes shares worth the debt and no more; the rest stays the
    ///      borrower's. If the collateral falls short, the pool takes the loss.
    function markDefaulted(address account) external nonReentrant {
        CreditAccount storage a = _accountOf(account);
        if (a.drawn == 0) revert NothingOwed();
        uint64 defaultableAt = _fixedRules(a) ? a.defaultableAt : a.dueAt + params().grace;
        if (block.timestamp <= defaultableAt) revert NotOverdue(defaultableAt);

        Collateral storage c = _prepareCollateral(account);
        uint256 debt = a.drawn;
        uint256 seized = Math.min(yieldVault().previewWithdraw(debt), c.shares);
        if (seized != 0) {
            _removeShares(c, seized);
            _pool().poolShares += seized;
        }

        _pool().totalDrawn -= debt;
        a.drawn = 0;
        a.cycleCount += 1;
        a.defaulted = true;
        _resetCycle(a);
        emit Defaulted(account, debt, seized, _score(a));
    }

    function accountOf(address account) external view returns (CreditAccount memory) {
        return _accountOf(account);
    }

    function scoreOf(address account) public view returns (uint256) {
        return _score(_accountOf(account));
    }

    function limitOf(address account) public view returns (uint256) {
        return CreditScoring.limit(collateralValueOf(account), scoreOf(account));
    }

    /// @notice What `draw` would allow right now, including pool liquidity.
    function availableOf(address account) external view returns (uint256) {
        CreditAccount storage a = _accountOf(account);
        if (a.defaulted || !isVerified(account)) return 0;
        uint256 ceiling = limitOf(account);
        uint256 headroom = ceiling > a.drawn ? ceiling - a.drawn : 0;
        return Math.min(headroom, _pool().idle);
    }

    function _repay(address account, address payer, uint256 amount) internal {
        CreditAccount storage a = _accountOf(account);
        if (a.drawn == 0) revert NothingOwed();
        amount = Math.min(amount, a.drawn);
        if (amount == 0) revert ZeroAmount();

        IERC20(asset()).safeTransferFrom(payer, address(this), amount);
        _pool().idle += amount;
        _reduceDebt(account, a, amount);
        emit Repaid(account, payer, amount, a.drawn);
    }

    function _reduceDebt(address account, CreditAccount storage a, uint256 amount) internal {
        a.drawn -= amount;
        _pool().totalDrawn -= amount;
        if (a.drawn == 0) _closeCycle(account, a);
    }

    /// @dev A cycle counts only if it was repaid on time, lasted long enough,
    ///      and used enough of the limit, judged by the rules in force when the
    ///      cycle opened. Anything else settles the debt and proves nothing.
    function _closeCycle(address account, CreditAccount storage a) internal {
        (uint256 minDuration, uint256 minUtilizationBps) = _fixedRules(a)
            ? (uint256(a.cycleMinDuration), uint256(a.cycleMinUtilizationBps))
            : (uint256(params().minCycleDuration), uint256(params().minUtilizationBps));
        bool qualifying = block.timestamp <= a.dueAt && block.timestamp - a.drawnAt >= minDuration
            && a.peakDrawn * BPS >= minUtilizationBps * a.limitAtDraw;
        if (qualifying) {
            a.cycleCount += 1;
            a.repayCount += 1;
            a.volumeBps += SafeCast.toUint64(
                CreditScoring.utilizationBps(a.peakDrawn, a.limitAtDraw)
            );
        }
        _resetCycle(a);
        emit CycleClosed(account, qualifying, _score(a));
    }

    function _resetCycle(CreditAccount storage a) internal {
        a.drawnAt = 0;
        a.dueAt = 0;
        a.defaultableAt = 0;
        a.cycleMinDuration = 0;
        a.cycleMinUtilizationBps = 0;
        a.limitAtDraw = 0;
        a.peakDrawn = 0;
    }

    /// @dev False only for a cycle opened by the first implementation, which
    ///      fixed nothing; those fall back to the current parameters.
    function _fixedRules(CreditAccount storage a) internal view returns (bool) {
        return a.defaultableAt != 0;
    }

    function _score(CreditAccount storage a) internal view returns (uint256) {
        return CreditScoring.score(a.cycleCount, a.repayCount, a.volumeBps);
    }

    function _accountOf(address account) internal view returns (CreditAccount storage) {
        return _credit().accounts[account];
    }

    function _credit() private pure returns (CreditStorage storage $) {
        assembly {
            $.slot := CREDIT_STORAGE
        }
    }
}
