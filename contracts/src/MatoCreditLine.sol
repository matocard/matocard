// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {
    AccessControlDefaultAdminRules
} from "@openzeppelin/contracts/access/extensions/AccessControlDefaultAdminRules.sol";
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {CreditScoring} from "./libraries/CreditScoring.sol";

/// @title MatoCreditLine
/// @notice An interest-free credit line in AUSD whose limit grows with the
///         borrower's repayment record.
///
/// @dev Two sides in one contract:
///      - Lenders hold shares of this ERC4626 pool over AUSD. The pool earns the
///        protocol's cut of borrowers' collateral yield and carries default risk.
///      - Borrowers post collateral as shares of a yield vault (earnAUSD on
///        mainnet), and draw against it at a ratio set by `CreditScoring`.
///
///      Collateral and debt are both AUSD, so no price feed is involved. Every
///      figure behind a limit is readable on chain and recomputable by hand.
contract MatoCreditLine is ERC4626, AccessControlDefaultAdminRules, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant KYC_ROLE = keccak256("KYC_ROLE");
    bytes32 public constant RELAYER_ROLE = keccak256("RELAYER_ROLE");

    uint256 internal constant BPS = 10_000;

    enum DepositMethod {
        Bank,
        Card
    }

    struct Params {
        /// @notice How long a cycle may stay open before it is due.
        uint64 term;
        /// @notice Time after `dueAt` before anyone can mark a default.
        uint64 grace;
        /// @notice A cycle shorter than this settles the debt and proves nothing.
        uint64 minCycleDuration;
        /// @notice How long a card deposit waits before it counts, for chargebacks.
        uint64 cardHold;
        /// @notice A cycle that used less of its limit than this proves nothing.
        uint16 minUtilizationBps;
        /// @notice The pool's cut of a borrower's collateral yield.
        uint16 yieldFeeBps;
    }

    struct Account {
        uint256 drawn;
        uint256 limitAtDraw;
        uint256 peakDrawn;
        uint64 drawnAt;
        uint64 dueAt;
        /// @notice Qualifying cycles plus defaults.
        uint64 cycleCount;
        /// @notice Qualifying cycles repaid to zero.
        uint64 repayCount;
        /// @notice Sum of utilisation over qualifying cycles, in bps.
        uint64 volumeBps;
        bool defaulted;
    }

    struct Collateral {
        /// @notice Yield-vault shares counted toward the limit.
        uint256 shares;
        /// @notice Asset value of `shares` when the yield fee was last taken.
        uint256 principal;
        /// @notice Card deposits still inside their hold.
        uint256 pendingShares;
        uint256 pendingPrincipal;
        uint64 pendingUntil;
    }

    // forge-lint: disable-next-line(screaming-snake-case-immutable)
    IERC4626 public immutable yieldVault;

    Params public params;

    /// @notice AUSD in this contract that belongs to the pool and is not lent out.
    /// @dev Tracked rather than read from `balanceOf`, so a donation cannot move
    ///      the pool's share price.
    uint256 public idle;

    uint256 public totalDrawn;

    /// @notice Yield-vault shares owned by the pool: seized on default, or taken
    ///         as the yield fee.
    uint256 public poolShares;

    mapping(address => Account) internal _accounts;
    mapping(address => Collateral) internal _collateral;

    /// @notice One identity, one wallet, in both directions.
    mapping(address => bytes32) public identityOf;
    mapping(bytes32 => address) public walletOfIdentity;

    event ParamsChanged(Params params);
    event Verified(address indexed wallet, bytes32 indexed identityHash);
    event CollateralDeposited(
        address indexed account,
        address indexed payer,
        DepositMethod method,
        uint256 assets,
        uint256 shares,
        uint64 countsFrom
    );
    event PendingSettled(address indexed account, uint256 shares);
    event PendingCancelled(address indexed account, uint256 shares, address indexed to);
    event CollateralWithdrawn(address indexed account, uint256 shares, uint256 assets);
    event YieldFeeTaken(address indexed account, uint256 shares);
    event Drawn(address indexed account, address indexed to, uint256 amount, uint256 drawn);
    event Repaid(address indexed account, address indexed payer, uint256 amount, uint256 drawn);
    event CycleClosed(address indexed account, bool qualifying, uint256 score);
    event Defaulted(
        address indexed account, uint256 writtenOff, uint256 sharesSeized, uint256 score
    );
    event PoolSharesRedeemed(uint256 shares, uint256 assets);

    error ZeroAmount();
    error ZeroAddress();
    error BadParams();
    error VaultAssetMismatch();
    error NotVerified(address account);
    error AlreadyVerified(address wallet);
    error IdentityTaken(bytes32 identityHash);
    error AccountInDefault(address account);
    error ExceedsLimit(uint256 requested, uint256 available);
    error InsufficientLiquidity(uint256 requested, uint256 idle);
    error InsufficientCollateral(uint256 requested, uint256 held);
    error OverLimitAfterWithdrawal();
    error NothingOwed();
    error NotOverdue(uint64 defaultableAt);

    constructor(IERC20 ausd, IERC4626 vault, address admin, Params memory p)
        ERC20("Matocard Pool", "mPOOL")
        ERC4626(ausd)
        AccessControlDefaultAdminRules(1 days, admin)
    {
        if (vault.asset() != address(ausd)) {
            revert VaultAssetMismatch();
        }
        yieldVault = vault;
        _setParams(p);
    }

    // ---------------------------------------------------------------- admin

    function setParams(Params calldata p) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setParams(p);
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    /// @notice Binds a verified identity to one wallet, for good.
    /// @dev Without this a defaulter opens a fresh wallet and the record means
    ///      nothing. Only a hash of the identity is stored.
    function setVerified(address wallet, bytes32 identityHash) external onlyRole(KYC_ROLE) {
        if (wallet == address(0)) revert ZeroAddress();
        if (identityHash == bytes32(0)) revert ZeroAmount();
        if (identityOf[wallet] != bytes32(0)) revert AlreadyVerified(wallet);
        if (walletOfIdentity[identityHash] != address(0)) revert IdentityTaken(identityHash);
        identityOf[wallet] = identityHash;
        walletOfIdentity[identityHash] = wallet;
        emit Verified(wallet, identityHash);
    }

    // ----------------------------------------------------------- collateral

    /// @notice Credits a fiat top-up. The AUSD comes from the relayer's treasury.
    /// @dev The relayer names the method; the contract decides the hold, so a
    ///      card deposit cannot be made to count early.
    function depositFor(address account, uint256 assets, DepositMethod method)
        external
        onlyRole(RELAYER_ROLE)
        whenNotPaused
        nonReentrant
    {
        _addCollateral(account, msg.sender, assets, method);
    }

    /// @notice Posts AUSD the caller already holds. Counts immediately.
    function depositCollateral(uint256 assets) external whenNotPaused nonReentrant {
        _addCollateral(msg.sender, msg.sender, assets, DepositMethod.Bank);
    }

    /// @notice Moves card deposits whose hold has ended into collateral.
    function settlePending(address account) external {
        _settlePending(account, _collateral[account]);
    }

    /// @notice Reverses card deposits still inside their hold, for a chargeback.
    /// @dev The shares go back to the relayer's treasury. Collateral that has
    ///      cleared its hold is out of reach.
    function cancelPending(address account, uint256 shares)
        external
        onlyRole(RELAYER_ROLE)
        nonReentrant
    {
        Collateral storage c = _collateral[account];
        _settlePending(account, c);
        if (shares == 0) revert ZeroAmount();
        if (shares > c.pendingShares) revert InsufficientCollateral(shares, c.pendingShares);

        c.pendingPrincipal -= Math.mulDiv(c.pendingPrincipal, shares, c.pendingShares);
        c.pendingShares -= shares;
        IERC20(address(yieldVault)).safeTransfer(msg.sender, shares);
        emit PendingCancelled(account, shares, msg.sender);
    }

    /// @notice Takes collateral back as AUSD, as long as the limit still covers
    ///         what is owed.
    function withdrawCollateral(uint256 shares) external whenNotPaused nonReentrant {
        Collateral storage c = _prepareCollateral(msg.sender);
        if (shares == 0) revert ZeroAmount();
        if (shares > c.shares) revert InsufficientCollateral(shares, c.shares);

        c.principal -= Math.mulDiv(c.principal, shares, c.shares);
        c.shares -= shares;
        Account storage a = _accounts[msg.sender];
        if (a.drawn > CreditScoring.limit(_value(c), _score(a))) revert OverLimitAfterWithdrawal();

        uint256 assets = yieldVault.redeem(shares, msg.sender, address(this));
        emit CollateralWithdrawn(msg.sender, shares, assets);
    }

    // --------------------------------------------------------------- credit

    /// @notice Draws AUSD against the limit and pays it to `to` (a family
    ///         member's account, the payout treasury, or a merchant).
    function draw(uint256 amount, address to) external whenNotPaused nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (to == address(0)) revert ZeroAddress();
        if (identityOf[msg.sender] == bytes32(0)) revert NotVerified(msg.sender);
        Account storage a = _accounts[msg.sender];
        if (a.defaulted) revert AccountInDefault(msg.sender);

        Collateral storage c = _collateral[msg.sender];
        _settlePending(msg.sender, c);
        uint256 ceiling = CreditScoring.limit(_value(c), _score(a));
        uint256 headroom = ceiling > a.drawn ? ceiling - a.drawn : 0;
        if (amount > headroom) revert ExceedsLimit(amount, headroom);
        if (amount > idle) revert InsufficientLiquidity(amount, idle);

        if (a.drawn == 0) {
            a.drawnAt = uint64(block.timestamp);
            a.dueAt = uint64(block.timestamp) + params.term;
            a.limitAtDraw = ceiling;
            a.peakDrawn = 0;
        }
        a.drawn += amount;
        if (a.drawn > a.peakDrawn) a.peakDrawn = a.drawn;
        totalDrawn += amount;
        idle -= amount;

        IERC20(asset()).safeTransfer(to, amount);
        emit Drawn(msg.sender, to, amount, a.drawn);
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
        Account storage a = _accounts[msg.sender];
        if (a.drawn == 0) revert NothingOwed();
        amount = Math.min(amount, a.drawn);
        if (amount == 0) revert ZeroAmount();

        Collateral storage c = _prepareCollateral(msg.sender);
        uint256 shares = yieldVault.previewWithdraw(amount);
        if (shares > c.shares) revert InsufficientCollateral(shares, c.shares);
        c.principal -= Math.mulDiv(c.principal, shares, c.shares);
        c.shares -= shares;
        yieldVault.withdraw(amount, address(this), address(this));

        idle += amount;
        _reduceDebt(msg.sender, a, amount);
        emit Repaid(msg.sender, address(this), amount, a.drawn);
    }

    /// @notice Closes an overdue position against its collateral. Anyone can
    ///         call it once the grace period has passed.
    /// @dev Seizes shares worth the debt and no more; the rest stays the
    ///      borrower's. If the collateral falls short, the pool takes the loss.
    function markDefaulted(address account) external nonReentrant {
        Account storage a = _accounts[account];
        if (a.drawn == 0) revert NothingOwed();
        uint64 defaultableAt = a.dueAt + params.grace;
        if (block.timestamp <= defaultableAt) revert NotOverdue(defaultableAt);

        Collateral storage c = _prepareCollateral(account);
        uint256 debt = a.drawn;
        uint256 seized = Math.min(yieldVault.previewWithdraw(debt), c.shares);
        if (seized != 0) {
            c.principal -= Math.mulDiv(c.principal, seized, c.shares);
            c.shares -= seized;
            poolShares += seized;
        }

        totalDrawn -= debt;
        a.drawn = 0;
        a.cycleCount += 1;
        a.defaulted = true;
        _resetCycle(a);
        emit Defaulted(account, debt, seized, _score(a));
    }

    /// @notice Turns pool-owned vault shares into AUSD lenders can withdraw.
    function redeemPoolShares(uint256 shares) external nonReentrant {
        if (shares == 0) revert ZeroAmount();
        if (shares > poolShares) revert InsufficientCollateral(shares, poolShares);
        poolShares -= shares;
        uint256 assets = yieldVault.redeem(shares, address(this), address(this));
        idle += assets;
        emit PoolSharesRedeemed(shares, assets);
    }

    // ---------------------------------------------------------------- views

    function accountOf(address account) external view returns (Account memory) {
        return _accounts[account];
    }

    function collateralOf(address account) external view returns (Collateral memory) {
        return _collateral[account];
    }

    function isVerified(address account) external view returns (bool) {
        return identityOf[account] != bytes32(0);
    }

    function scoreOf(address account) public view returns (uint256) {
        return _score(_accounts[account]);
    }

    /// @notice Collateral counted toward the limit, net of the yield fee owed,
    ///         including card deposits whose hold has ended.
    function collateralValueOf(address account) public view returns (uint256) {
        Collateral storage c = _collateral[account];
        uint256 value = _value(c);
        if (c.pendingShares != 0 && block.timestamp >= c.pendingUntil) {
            value += yieldVault.convertToAssets(c.pendingShares);
        }
        return value;
    }

    function limitOf(address account) public view returns (uint256) {
        return CreditScoring.limit(collateralValueOf(account), scoreOf(account));
    }

    /// @notice What `draw` would allow right now, including pool liquidity.
    function availableOf(address account) external view returns (uint256) {
        Account storage a = _accounts[account];
        if (a.defaulted || identityOf[account] == bytes32(0)) return 0;
        uint256 ceiling = limitOf(account);
        uint256 headroom = ceiling > a.drawn ? ceiling - a.drawn : 0;
        return Math.min(headroom, idle);
    }

    // ----------------------------------------------------------- LP (ERC4626)

    function totalAssets() public view override returns (uint256) {
        return idle + totalDrawn + yieldVault.convertToAssets(poolShares);
    }

    /// @notice Lenders cannot take out AUSD that is lent to borrowers.
    function maxWithdraw(address owner) public view override returns (uint256) {
        return Math.min(super.maxWithdraw(owner), idle);
    }

    function maxRedeem(address owner) public view override returns (uint256) {
        return Math.min(super.maxRedeem(owner), _convertToShares(idle, Math.Rounding.Floor));
    }

    /// @dev Virtual shares against the first-depositor inflation attack.
    function _decimalsOffset() internal pure override returns (uint8) {
        return 6;
    }

    function _deposit(address caller, address receiver, uint256 assets, uint256 shares)
        internal
        override
    {
        super._deposit(caller, receiver, assets, shares);
        idle += assets;
    }

    function _withdraw(
        address caller,
        address receiver,
        address owner,
        uint256 assets,
        uint256 shares
    ) internal override {
        idle -= assets;
        super._withdraw(caller, receiver, owner, assets, shares);
    }

    // ------------------------------------------------------------- internal

    function _setParams(Params memory p) internal {
        if (p.term == 0 || p.minUtilizationBps > BPS || p.yieldFeeBps > BPS) revert BadParams();
        params = p;
        emit ParamsChanged(p);
    }

    function _addCollateral(address account, address payer, uint256 assets, DepositMethod method)
        internal
    {
        if (assets == 0) revert ZeroAmount();
        if (identityOf[account] == bytes32(0)) revert NotVerified(account);

        IERC20 ausd = IERC20(asset());
        ausd.safeTransferFrom(payer, address(this), assets);
        ausd.forceApprove(address(yieldVault), assets);
        uint256 shares = yieldVault.deposit(assets, address(this));

        Collateral storage c = _prepareCollateral(account);
        uint64 countsFrom = uint64(block.timestamp);
        if (method == DepositMethod.Card && params.cardHold != 0) {
            countsFrom += params.cardHold;
            c.pendingShares += shares;
            c.pendingPrincipal += assets;
            if (countsFrom > c.pendingUntil) c.pendingUntil = countsFrom;
            countsFrom = c.pendingUntil;
        } else {
            c.shares += shares;
            c.principal += assets;
        }
        emit CollateralDeposited(account, payer, method, assets, shares, countsFrom);
    }

    /// @dev Settles matured card deposits and takes the yield fee, so every
    ///      change to collateral starts from an up-to-date basis.
    function _prepareCollateral(address account) internal returns (Collateral storage c) {
        c = _collateral[account];
        _settlePending(account, c);
        _takeYieldFee(account, c);
    }

    function _settlePending(address account, Collateral storage c) internal {
        uint256 shares = c.pendingShares;
        if (shares == 0 || block.timestamp < c.pendingUntil) return;
        c.shares += shares;
        c.principal += c.pendingPrincipal;
        c.pendingShares = 0;
        c.pendingPrincipal = 0;
        c.pendingUntil = 0;
        emit PendingSettled(account, shares);
    }

    function _takeYieldFee(address account, Collateral storage c) internal {
        if (c.shares == 0) return;
        uint256 value = yieldVault.convertToAssets(c.shares);
        uint256 fee = _feeOwed(value, c.principal);
        if (fee == 0) return;
        uint256 feeShares = Math.min(yieldVault.convertToShares(fee), c.shares);
        c.shares -= feeShares;
        c.principal = value - fee;
        poolShares += feeShares;
        emit YieldFeeTaken(account, feeShares);
    }

    function _feeOwed(uint256 value, uint256 principal) internal view returns (uint256) {
        if (value <= principal) return 0;
        return ((value - principal) * params.yieldFeeBps) / BPS;
    }

    /// @dev Settled collateral, net of the yield fee not yet taken.
    function _value(Collateral storage c) internal view returns (uint256) {
        uint256 value = yieldVault.convertToAssets(c.shares);
        return value - _feeOwed(value, c.principal);
    }

    function _score(Account storage a) internal view returns (uint256) {
        return CreditScoring.score(a.cycleCount, a.repayCount, a.volumeBps);
    }

    function _repay(address account, address payer, uint256 amount) internal {
        Account storage a = _accounts[account];
        if (a.drawn == 0) revert NothingOwed();
        amount = Math.min(amount, a.drawn);
        if (amount == 0) revert ZeroAmount();

        IERC20(asset()).safeTransferFrom(payer, address(this), amount);
        idle += amount;
        _reduceDebt(account, a, amount);
        emit Repaid(account, payer, amount, a.drawn);
    }

    function _reduceDebt(address account, Account storage a, uint256 amount) internal {
        a.drawn -= amount;
        totalDrawn -= amount;
        if (a.drawn == 0) _closeCycle(account, a);
    }

    /// @dev A cycle counts only if it was repaid on time, lasted long enough,
    ///      and used enough of the limit. Anything else settles the debt and
    ///      proves nothing, so a record cannot be farmed with tiny or instant
    ///      loops.
    function _closeCycle(address account, Account storage a) internal {
        Params memory p = params;
        bool qualifying = block.timestamp <= a.dueAt
            && block.timestamp - a.drawnAt >= p.minCycleDuration
            && a.peakDrawn * BPS >= uint256(p.minUtilizationBps) * a.limitAtDraw;
        if (qualifying) {
            a.cycleCount += 1;
            a.repayCount += 1;
            a.volumeBps += uint64(CreditScoring.utilizationBps(a.peakDrawn, a.limitAtDraw));
        }
        _resetCycle(a);
        emit CycleClosed(account, qualifying, _score(a));
    }

    function _resetCycle(Account storage a) internal {
        a.drawnAt = 0;
        a.dueAt = 0;
        a.limitAtDraw = 0;
        a.peakDrawn = 0;
    }
}
