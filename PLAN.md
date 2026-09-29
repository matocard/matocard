# Matocard — PLAN

> **A card whose limit grows with how you pay, and whose credit history crosses borders with you.**
> Deposit once. Your collateral grows. Your limit rises every time you settle on time.

Built for **Monad Metropolis**, Track 02: Consumer Products & Payments.
Everything in this repo is built during the hackathon window (see §14).

---

## 1. Hackathon context

| | |
|---|---|
| Event | [Monad Metropolis](https://monad.xyz/developers/hackathons/metropolis) |
| Registration closes | **6 October 2026** |
| Submission deadline | **14 October 2026, 10:59 WIB** (shown as 13 Oct in US time zones) |
| Judging / winners | 14 Oct – 3 Nov / from 4 Nov |
| Track | **02 Consumer Products & Payments**. Core question: *"What does a financial product look like when onchain rails are leveraged as an advantage to design?"* Design is judged on an invisible blockchain: "judge harshly on any point of friction that reveals this is crypto" |
| Rubric | Technical 20 · Design 20 · Originality 15 · **Founder & Market 25** · **Traction 20**. 45% is segment + real usage, so user testing is part of the build (§2.1, §12) |
| Deliverables | Logo · public repo shared with `metropolis@hackathon.monad.xyz` · demo video ≤ 3 min of the live product · pitch video ≤ 2 min · live link on Monad testnet with judge instructions |
| Rules | One primary track only. Existing projects allowed as long as **the submitted work is new** |
| Track prize | $30k split across 3 teams ($10k each) |
| Grand Champion | $25k, chosen across all tracks |

**Target bounties** (stack on top of the track prize)

| Bounty | Value | Hard requirement | How we meet it |
|---|---|---|---|
| Agora: Best Cross-Border Payments App on Monad | $10k | Track 02 only. Mobile app, **Mera passkey onboarding**, AUSD balance, a completed send/receive settled instantly | Passkey signup (D3), AUSD everywhere (D1), Siti draws AUSD straight to Mom's Matocard (§3 step 5), and anyone sends AUSD from their balance with a gasless ERC-3009 transfer (D11). The demo must show an AUSD balance (§3 copy rules) |
| Monad Foundation: Best Community Team Project | $5k | Team members pick an onboarded community on their profile | DevWeb3Jogja is on the list. Pick it on day 1 |
| Envio: Best Use of Envio | $1k | Indexer drives a real feature; depth (derived entities) scores higher | Activity feed, `/verify` score history, reconciliation totals |
| (stretch) Mera: Best Mera-Powered UX | $2.5k | Mera is the whole account layer, stateless test | Weak fit: fiat top-up needs a custodial treasury. Enter only if the passkey flow turns out very clean |
| (optional) ack3 security scan | – | – | Scan contracts before submitting |

**Dropped: Privy ($5k).** It needs Privy used beyond login, and Agora needs Mera for login. One account layer, the one attached to the bigger bounty.

---

## 2. Problem and persona

**Siti, 29**, an Indonesian migrant worker in Kuala Lumpur (Malaysia is one of the largest destinations for Indonesian migrant workers).
- No credit history in Malaysia, and none in Indonesia either. Banks in both countries treat her as a stranger.
- Sends money to her mother in Yogyakarta every month. Sometimes needs emergency cash before payday, and her only options are predatory online lenders or loan sharks.
- Has a debit card and a phone. No crypto wallet, and does not care about crypto.

**Why onchain?** A bank's credit record is locked to one country and one institution. Matocard's record lives on Monad: **Siti owns it, anyone can verify it, and it still counts when she moves home to Indonesia.** The blockchain is used here as a portable, tamper-proof record, not as a trading venue. Settlement is instant, so money sent to Mom arrives while Siti is still on the call.

### 2.1 Segment, testing and distribution (Founder & Market 25%, Traction 20%)
- **First segment:** Indonesian workers in Malaysia sending money home to Central Java / DIY. Named, reachable, and close to the team (Yogyakarta).
- **Testing before submission:** at least 5 people from the segment (or their families in Jogja) run the §3 flow on their own phones, unaided. Record: time to first send, where they got stuck, what they said. Put the numbers in the write-up.
- **Next 100 users:** migrant worker WhatsApp/Facebook groups, worker associations, and the families' side in Jogja (the receiver installs Matocard to cash out, then tells the next sender). Each receive is a referral.
- **Next step after the hackathon:** a licensed partner for the card and remittance legs (§9), mainnet with earnAUSD.

---

## 3. Product: user journey (demo script, video ≤ 3 minutes)

Amounts below assume 1 USD = 4.00 MYR = 16,000 IDR for readability. The live app uses the real rate.

```
1. Sign up with Face ID / fingerprint                      (Mera passkey, account derived silently)
2. Verify identity: ID/passport photo + selfie             (Didit sandbox, auto-approve)
   → the relayer tops the account up with a little MON for fees, invisibly
3. Top up RM 600 with a debit card                         (Xendit test mode, test card)
   → "Processing", then the card hold period (60 seconds on testnet)
4. Home screen:
      Collateral         150.00 AUSD   (≈ RM 600 · ≈ Rp 2.4m)
      Credit score       0
      Collateral ratio   150%
      ─────────────────────────
      Available credit   100.00 AUSD   (≈ RM 400)
5. "Send to Mom": Rp 800,000 (≈ 50 AUSD), FX rate locked for 60 seconds
   → draw(50 AUSD, to = Mom's Matocard) settles in under a second
   → Mom's phone (second device, her own passkey) shows +50.00 instantly
   → Mom taps "Cash out to BRI" → rupiah in her bank account   (Xendit Disbursement test)
6. Payday → "Settle" via DuitNow QR / FPX (Xendit)
   → Score goes up, limit goes up, and the breakdown is shown
7. Open /verify/siti-7F3A: score, settled cycles, history. No personal data, read straight from the contract
   "A bank in Indonesia can still read this record when Siti moves home."
```

Optional if time allows: **Scan a merchant QR** (demo merchant page) as a second spending path.

### Copywriting rules
- Words banned from user-facing screens: wallet, gas, chain, token, onchain transaction, seed, AUSD (except in detail/breakdown views).
- The Agora bounty needs **an AUSD balance on screen** in the demo: show the headline in local currency, with "AUSD" on the balance's detail row (e.g. `Balance 50.00 USD · AUSD`). Wording is the app owner's call.
- Headline amounts are in local currency with "≈". Debt is always shown in its locked dollar value, to be honest about FX risk (§7.4).
- Always show **why** the limit is what it is (collateral, score, ratio).
- Never say "dividend" or "interest". Say "collateral yield" and "interest-free".

---

## 4. Design decisions (and why)

| # | Decision | Why |
|---|---|---|
| D1 | **AUSD is the onchain unit of account.** Collateral, loans, repayments and sends are all AUSD | Collateral and debt share one currency, so the ratio is immune to FX and no oracle is needed. Required by the Agora bounty |
| D2 | **FX lives offchain only**, locked per quote (60-second TTL) | The contract stays simple and verifiable. FX is purely a display and edge-conversion concern |
| D3 | **Invisible account.** Mera passkey derives a plain EOA; a signing session makes in-app actions prompt-free; the relayer drips MON for fees after KYC | No seed phrase, no extension, no MON to buy. Required by the Agora bounty. Gas on Monad is ~$0.0005 per tx, so a drip is cheaper than a paymaster and needs no extra infra |
| D4 | **One identity, one account.** KYC binds `identityHash → wallet` in the contract | Without this, a defaulter just makes a new wallet and the score means nothing |
| D5 | **Card deposit hold enforced in the contract.** The relayer names the payment method; the contract picks the hold | Protects against chargebacks. The relayer cannot shorten a card hold, so the "provable limit" claim holds |
| D6 | **Collateral held as yield-vault shares (ERC4626)** | Collateral grows. Value is read via `convertToAssets`, no external oracle |
| D7 | **Default = collateral shares worth the debt are seized**, not redeemed | earnAUSD has a withdrawal queue of up to 72 hours. Seizing shares is instant, and the pool can redeem later. Anything above the debt stays the user's |
| D8 | **Interest-free for borrowers.** The protocol keeps `yieldFeeBps` of each user's collateral yield, collected when shares leave | A clear business model, an incentive for LPs, and friendly to Muslim users |
| D9 | **One UUPS proxy, built from modules** (`MatoCreditLine`) | Governed, PoolModule, IdentityModule, CollateralModule and CreditModule compose one implementation; each keeps its state in its own ERC-7201 namespace, so a module can change in an upgrade without shifting another's slots. One address for the app, the indexer and `/verify` |
| D10 | **Daily offchain ↔ onchain reconciliation** | Fiat enters via webhooks and the balances must match the contract's records |
| D11 | **Plain sends use AUSD's ERC-3009.** The sender signs `transferWithAuthorization`; the relayer submits it and pays the gas | "Send AUSD to another person, settled instantly" is the Agora bounty's first requirement. No approval, no MON needed for a send, one transaction. TestAUSD mirrors this so app code is the same on both tokens |
| D12 | **Production fiat rail is Agora's Routes API** (fiat ↔ AUSD mint and redeem). Xendit test mode stands in for the demo | The bounty asks teams to build against Agora's public API, and minting at the issuer removes our own treasury float. The API is production-only and needs an Agora organisation account (Q8) |

---

## 5. Architecture

```
┌──────────────────────── User (mobile web / PWA) ─────────────────────────────┐
│  Next.js app + Mera passkey (signing session)                                │
└───────────────┬──────────────────────────────┬───────────────────────────────┘
                │ HTTPS                        │ tx (draw, repay, withdraw)
┌───────────────▼────────────── Backend (Railway) ─────────────────────────────┐
│  api        : one response per screen, combining indexer + contract + DB     │
│  kyc        : Didit sessions + webhook                                       │
│  payments   : Xendit card/FPX/QR + disbursement, webhooks, ledger (Postgres) │
│  fx         : FX quotes locked for 60 seconds                                │
│  relayer    : depositFor / repayFor / cancelPending / setVerified, MON drip  │
└───────┬─────────────────────────────┬────────────────────────────────────────┘
        │ tx                          │ GraphQL
┌───────▼──────── Monad testnet (10143) ────────┐   ┌──────────────────────────┐
│  MatoCreditLine  (ERC4626 LP + credit + score)│──▶│ Envio indexer            │
│  AUSD (Agora testnet)                         │   │ activity feed, /verify   │
│  YieldVault: MockEarnAUSD (ERC4626)           │   └──────────────────────────┘
└───────────────────────────────────────────────┘
Demo pages: /merchant (QR) · /verify/:id (public)
```

---

## 6. Smart contracts

Foundry, default EVM version (Monad runs Fusaka). Measure gas on Monad itself: opcodes are repriced and gas is charged on the **limit**, not gas used.

### 6.1 Contracts
| Contract | Contents |
|---|---|
| `MatoCreditLine` | UUPS implementation behind an ERC1967 proxy, composed of the modules below |
| `modules/PoolModule` | Lenders' ERC4626 pool over AUSD, `idle` / `totalDrawn` / `poolShares` accounting |
| `modules/IdentityModule` | One identity hash per wallet, both ways |
| `modules/CollateralModule` | Yield-vault shares, card hold, chargeback reversal, yield fee |
| `modules/CreditModule` | Draw, repay, default, score and limit views |
| `CreditScoring` (library) | Score and ratio, pure and hand-checkable (§6.3) |
| `MockEarnAUSD` (testnet only) | ERC4626 over AUSD with a configurable yield. Replaced by earnAUSD (Upshift) on mainnet |
| `modules/Governed` | Roles, pause, parameters, UUPS upgrade authorisation; two-step admin handover with a one-day delay (OpenZeppelin `AccessControlDefaultAdminRules`) |

### 6.2 `MatoCreditLine` state and functions
```solidity
struct Account {
  uint256 drawn;            // AUSD owed
  uint64  drawnAt; uint64 dueAt;
  uint256 limitAtDraw;      // for utilisation
  uint256 peakDrawn;
  uint64  cycleCount;       // qualifying cycles + defaults
  uint64  repayCount;       // qualifying cycles only (partial repays never count)
  uint64  volumeBps;        // Σ utilisation per qualifying cycle (§6.3)
  bool    defaulted;
}
mapping(address => uint256) collateralShares;   // vault shares counted toward the limit
mapping(address => uint256) collateralPrincipal;// AUSD put in, for the yield fee (D8)
mapping(address => uint256) pendingShares;      // still in the hold period
mapping(address => uint64)  pendingUntil;
mapping(address => bool)    verified;           // set by KYC_ROLE
mapping(bytes32 => address) walletOfIdentity;   // one identity, one wallet
uint256 poolShares;                             // vault shares seized on default, owned by LPs
```

| Function | Who | Notes |
|---|---|---|
| `setVerified(wallet, identityHash)` | KYC_ROLE (relayer) | Reverts if identityHash is already bound to another wallet |
| `depositFor(user, ausd, method)` | RELAYER_ROLE | AUSD from treasury goes into the YieldVault. Shares go to `pending` until `now + hold(method)`: `cardHold` for card, 0 for bank/QR. The hold is a contract parameter, not a relayer argument |
| `cancelPending(user, shares)` | RELAYER_ROLE | Chargeback during the hold: pending shares go back to the treasury. Cannot touch settled collateral |
| `deposit(ausd)` | user | Direct deposit (crypto path, optional) |
| `settlePending(user)` | anyone | Moves pending to collateral once due. Also called automatically in `draw` |
| `draw(amount, to)` | user (verified, not defaulted) | `to` = Mom's account, payout treasury, or a merchant |
| `repay(amount)` / `repayFor(user, amount)` | user / anyone (the relayer after a fiat settlement) | Only repaying to zero closes a cycle. Overpayment is capped at `drawn`, not reverted. **Not pausable** |
| `repayFromCollateral(amount)` | user | Autopay from collateral (redeems vault shares; instant on the mock, queued on earnAUSD) |
| `withdrawCollateral(shares)` | user | Only if `drawn` stays ≤ limit after withdrawal. Yield fee taken here |
| `markDefaulted(user)` | anyone | After `dueAt + grace`. Seizes shares worth `min(drawn, collateral)` into `poolShares`, writes the debt off, `cycleCount++`. The rest stays the user's. The record stays |
| `limitOf / availableOf / scoreOf / accountOf / collateralValueOf` | view | Used by the app and `/verify`. Collateral value is net of the accrued yield fee |
| ERC4626 `deposit/withdraw` | LP | `maxWithdraw` capped at idle AUSD (cannot withdraw funds that are lent out) |

**Accounting:** `totalAssets = idleAUSD + totalDrawn + convertToAssets(poolShares)`. `idleAUSD` is tracked internally, never read from `balanceOf` (donations must not move the share price). Use OZ ERC4626's decimals offset against the first-depositor inflation attack.

**Parameters (testnet → production):** `term` 30 days · `grace` 3 days · `minCycleDuration` 60 s → 7 days · `cardHold` 60 s → 7 days · `minUtilizationBps` 1000 (10%) · `yieldFeeBps` 2000 (20%).

### 6.3 Score formula (anti-farming)
Score 0–100 = **Record (40) + Consistency (20) + Volume (40)**. Integer maths, one floor per component.

- **Qualifying cycle:** repaid to zero by `dueAt`, lasted ≥ `minCycleDuration`, and `peakDrawn ≥ 10% × limitAtDraw`. A non-qualifying close settles the debt and counts toward nothing.
- **Record** = `40 × repayCount × min(cycleCount,3) / (cycleCount × 3)`. The confidence ramp means one cycle cannot grant 40 points at once; defaults sit in `cycleCount` and drag it down.
- **Consistency** = `20 × min(repayCount,10) / 10`.
- **Volume** = `40 × min(volumeBps, 100_000) / 100_000`. Each qualifying cycle adds `min(peakDrawn × 10000 / limitAtDraw, 10000)`, so the target is 10 full-limit cycles.
- **Ratio (bps)** = `15000 − 7000 × score / 100` (150% at score 0 → 80% at score 100). **Limit** = `collateralValue × 10000 / ratioBps`, rounded down.

**Demo numbers** (checked by hand, must match the contract exactly, no yield):

| State | Score | Ratio | 150 AUSD collateral → Limit |
|---|---|---|---|
| New | 0 | 150.00% | **100.00** |
| 1 cycle, drew 50 (50% of limit) | 13 + 2 + 2 = **17** | 138.10% | **108.61** |
| "Siti, 3 months later": 3 cycles at 80% (prepared before the demo) | 40 + 6 + 9 = **55** | 111.50% | **134.52** |

> Above score ~72 the ratio drops below 100%, so the limit exceeds collateral and a default leaves the pool short. That is the LP risk the yield fee pays for; say it in `TRUST.md`.
> Collateral also grows from yield, so the limit rises slightly even when the score is flat. For the demo, set `MockEarnAUSD` to a clearly visible APY and state the number.

### 6.4 Invariants to test (Foundry)
- `totalAssets == idleAUSD + totalDrawn + convertToAssets(poolShares)`, and donations do not change the LP share price.
- `drawn(user) ≤ limitOf(user)` after every `draw` and `withdrawCollateral`.
- Pending shares never count toward the limit before `pendingUntil`.
- A card deposit can never be settled earlier than `cardHold`, whatever the relayer passes.
- One identityHash can never be bound to two wallets.
- Cycles below 10% utilisation or shorter than `minCycleDuration` add no score; partial repays add no `repayCount`.
- Default seizes at most `drawn` worth of shares; the remainder is still withdrawable.
- The §6.3 table, as literal numbers.
- `repay` still works while the contract is paused.
- Vault value drops: new draws are blocked, but the user is **not** auto-defaulted.
- Reentrancy on `draw` / `repay` / `markDefaulted`.
- RELAYER_ROLE cannot move funds out of the contract, except pending shares back to the treasury via `cancelPending`.

---

## 7. Backend

### 7.1 Services
| Service | Job |
|---|---|
| `api` | Per-screen endpoints: `/me`, `/me/activity`, `/quote`, `/verify/:id` |
| `kyc` | Didit session + webhook, then `setVerified` + MON drip |
| `payments` | Xendit: card/FPX/DuitNow QR (top-up + settlement), disbursement (cash out to an Indonesian bank). Production: Agora Routes for fiat ↔ AUSD (D12) |
| `relayer` | Tx queue: `depositFor`, `repayFor`, `cancelPending`, `setVerified`, ERC-3009 sends (D11), MON drip. Sends the published gas limits (`@matocard/contracts`) |
| `fx` | MYR/IDR/USD quotes, locked for 60 seconds |

### 7.2 Money-handling rules (mandatory)
1. **Verify webhooks**: check Xendit's `x-callback-token` header. Reject on mismatch.
2. **Idempotency**: `payments.provider_event_id UNIQUE`. A replayed webhook must never produce a double deposit.
3. **State machine** per payment: `PENDING → PAID → CREDITED_ONCHAIN → (SETTLED | REVERSED)`. Transitions are logged, never deleted.
4. **Append-only ledger** (simple double-entry: fiat in ↔ AUSD out of treasury).
5. **Daily reconciliation**: the sum of `CREDITED_ONCHAIN` must equal `CollateralDeposited` events in the indexer.
6. **Relayer key** in a secret manager, minimum roles, daily amount caps per user and globally. MON drip once per verified identity.
7. **Retry with backoff** for failed txs. Never resend without checking the previous status. A receipt is not success: read back the state the tx was meant to change.
8. **Monad specifics**: track nonces locally, send one tx at a time per key (no global mempool: back-to-back sends fail), hardcode gas limits (gas is charged on the limit).

### 7.3 Data model (Postgres)
```
users(id, wallet UNIQUE, kyc_status, identity_hash, country, created_at)
fx_quotes(id, pair, rate, expires_at)
payments(id, user_id, kind[topup|repay], method[card|bank|qr], provider_event_id UNIQUE,
         fiat_amount, currency, quote_id, ausd_amount, status, tx_hash, created_at)
payouts(id, user_id, kind[cashout|merchant], recipient_json, ausd_amount, fiat_amount,
        currency, quote_id, onchain_tx_hash, provider_disbursement_id, status)
ledger(id, ref_type, ref_id, account, debit, credit, currency, created_at)
```

### 7.4 FX and FX risk
- Debt is recorded in AUSD. Screens show "Owed 50.00 AUSD (≈ RM 210 today)".
- Siti carries the FX difference when she settles. Say so plainly on the settlement screen.
- FX source for the demo: a free public API. In production, the partner's rate.

---

## 8. Frontend (Next.js, mobile-first PWA)

| Screen | Contents |
|---|---|
| Onboarding | Passkey (Mera), choose country |
| Verification | Redirect to Didit, then status |
| Home | Card visual (HMAC-derived number), limit + breakdown (collateral, score, ratio), yield this month |
| Top up | Local amount → method (card / FPX / QR) → Xendit checkout → "processing / on hold" status |
| Send to family | IDR amount, recipient (Matocard contact, or bank + account no.), 60-second FX quote, confirm |
| Receive / cash out | Incoming sends in real time, "Cash out to bank" |
| Settle | Debt (AUSD + ≈ local), pay via FPX/QR or "deduct from collateral" |
| History | From Envio: top-ups, sends, settlements, score changes |
| `/verify/:id` (public) | Score, cycles, dates, explorer links. No name or document number |
| `/merchant` (demo, optional) | Invoice QR + real-time payment status |

Stack: Next.js, `@category-labs/mera`, viem/wagmi, Tailwind. Deployed on Vercel.

---

## 9. Security and trust (contents of `TRUST.md`)

| Part | Trusted party | Bounded by |
|---|---|---|
| Fiat → AUSD conversion, treasury | **Operator (custodial)** | Relayer can only `depositFor` / `repayFor` / `cancelPending`, daily caps, daily reconciliation |
| KYC status | Operator + Didit | Only an identity hash goes onchain |
| FX rate | Operator | Edge only. The onchain collateral ratio is unaffected |
| Collateral yield | Vault (testnet: **mock**; mainnet: earnAUSD) | earnAUSD comes from basis trade / delta-neutral strategies, not T-bills. Protocol risk exists. Withdrawals ≤72 h, but share seizure stays instant |
| LP capital | Borrowers above score ~72 | Limit can exceed collateral; the shortfall on default is the LP's loss, priced by the yield fee |
| Score, limit, default | **Contract**, recomputable by anyone | – |
| Account access | User's passkey | Lost passkey = lost account (R5). Passkeys sync via iCloud / Google Password Manager |
| Physical card issuing | **Not yet.** The card number is visual only (HMAC, private BIN) | Needs a licensed issuer |

**Regulation (roadmap, stated plainly):** credit + card needs a licensed bank/issuer. Remittance needs a Bank Indonesia licence and Malaysian regulatory approval. Crypto assets in Indonesia are supervised by OJK. The realistic path is licensed partners or the OJK Regulatory Sandbox (POJK 3/2024).

---

## 10. Repo layout

Bun + Turborepo workspaces, Biome at the root, husky pre-commit. Foundry for contracts.

```
apps/
  api/        HTTP API, one answer per screen (indexer + contract + DB)
  kyc/        Didit sessions + webhook, then setVerified + MON drip
  payments/   Xendit top-up, settlement, disbursement, ledger
  relayer/    tx queue: depositFor, repayFor, cancelPending, setVerified
  app/        Next.js PWA: all screens, /verify, /merchant
  landing/    marketing site (optional)
  indexer/    Envio: config.yaml, schema.graphql, handlers, tests
contracts/    Foundry: MatoCreditLine (UUPS) + modules/, CreditScoring, MockEarnAUSD, TestAUSD
packages/
  core/       shared types, money helpers, FX
  tsconfig/   shared TypeScript config
```

`fx` lives inside `api` until it needs its own process.

---

## 11. Resources

### 11.1 Networks and contracts
| Item | Value |
|---|---|
| Monad testnet | chain ID `10143`, RPC `https://testnet-rpc.monad.xyz` ([docs](https://docs.monad.xyz/developer-essentials/testnet), [faucet](https://faucet.monad.xyz/)) |
| AUSD, Monad testnet | `0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC`, 6 decimals ([Agora deployments](https://docs.agora.finance/developer/contract-deployments)) |
| AUSD, Monad mainnet | `0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a` |
| earnAUSD (Upshift), mainnet | Yield vault. Queued withdrawals ≤72 h, instant with a fee if reserves allow ([help](https://www.upshift.finance/help-center/en/articles/14471701-earning-stablecoin-yield-on-monad-with-earnausd)) |
| Pyth, Monad testnet | `0x2880aB155794e7179c9eE2e38200202908C17B43`. Unused (D1), fallback if an onchain FX rate is ever needed |

### 11.2 Third-party services
| Service | For | Status / notes |
|---|---|---|
| [Mera](https://mera.category.xyz/getting-started/) | Passkey account + signing sessions | Client-side library, no contract, no API key. Account still needs MON (relayer drip) |
| [Agora docs](https://docs.agora.finance/contract-overview) | AUSD | Bounty says build against Agora's public docs and staging environment |
| [Xendit](https://docs.xendit.co/docs/available-payment-channels) | Card, FPX / DuitNow QR (MY), disbursement (ID) | Countries: ID, MY, PH, TH, VN. Test key `xnd_development_…` |
| [Didit](https://didit.me) | Document + liveness KYC | Use the sandbox |
| [Envio](https://envio.dev) | Indexer | Monad testnet. Dev tier keeps 3 deployments: a redeploy deletes the oldest URL |
| Railway | api, kyc, payments, relayer, Postgres | |
| Vercel | App | |
| Public FX API | Demo FX quotes | Pick a free one |

### 11.3 Accounts and credentials to prepare
- [ ] Register for Metropolis (closes 6 Oct), create team + project, pick **Track 02**, set community to **DevWeb3Jogja** on every member's profile
- [ ] Join the Monad Discord, get the Metropolis role
- [ ] Xendit test account: **check whether one account can accept MYR and disburse IDR** (§13)
- [ ] Didit sandbox
- [ ] Railway + Postgres, Vercel, Envio
- [ ] Deployer + relayer + treasury wallets, funded with testnet MON (the relayer also funds user drips)
- [ ] **Testnet AUSD**: no documented faucet. Ask Agora (Discord / bounty channel)

### 11.4 Team (fill in)
| Role | Person |
|---|---|
| Contracts + tests (`contracts/`) | FjrREPO |
| Indexer (`apps/indexer`) | FjrREPO |
| Backend (`api`, `kyc`, `payments`, `relayer`) | |
| Frontend + UX (`app`, `landing`) | |
| Demo, video, user testing, write-up | |

---

## 12. Schedule (29 September – 13 October 2026, deadline 14 Oct 10:59 WIB)

| Day | Date | Goal | Done when |
|---|---|---|---|
| 1 | 29 Sep | Register (§11.3), new repo, monorepo, **ask Agora about testnet AUSD + PWA, check Xendit MYR** | Q1–Q3 in §13 answered or have fallbacks |
| 2–3 | 30 Sep–1 Oct | `CreditScoring` + `MatoCreditLine` + `MockEarnAUSD` + invariant tests | `forge test` green, §6.3 numbers match |
| 4 | 2 Oct | Deploy to Monad testnet, fund LP pool, demo accounts | Manual draw/repay works via cast |
| 5–6 | 3–4 Oct | `payments` + `relayer` + `fx`: Xendit webhooks, idempotency, ledger | Test-card top-up → pending shares in the contract |
| 7 | 5 Oct | `kyc` → `setVerified` + drip, Mera passkey login | Sign up → verified → account ready, no MON bought |
| 8–9 | 6–7 Oct | App: home + limit breakdown, top up, send to Mom + receive + cash out, settle | §3 steps 1–6 work end to end on two phones |
| 10 | 8 Oct | Envio (feed + `/verify`), yield in UI | Public `/verify` page works |
| 11 | 9 Oct | **User testing** with ≥5 people from the segment, then fix what broke | Numbers from §2.1 written down |
| 12 | 10 Oct | Hardening: amount caps, reconciliation, security scan, `TRUST.md` | §9 checklist complete |
| 13 | 11 Oct | Prepare the "Siti, 3 months later" account, record demo video + pitch video | Demo ≤ 3 min, pitch ≤ 2 min |
| 14 | 12 Oct | Write-up, README, diagrams, logo, judge instructions | Submission draft complete |
| 15 | 13 Oct | Buffer + **submit** | Submitted a day before the deadline |

**If time runs short, cut in this order:** `/merchant` QR → yield (plain AUSD collateral) → settlement via Xendit (use `repayFromCollateral`) → multi-currency display (IDR only).
**Never cut:** passkey signup → card top-up → limit → send to Mom (received instantly) → settle → score up → `/verify`. User testing is never cut either: it is 20% of the score.

---

## 13. Open questions and risks

| # | Question / risk | Impact | Action |
|---|---|---|---|
| Q1 | Does the Agora bounty accept testnet AUSD, or want their staging environment / mainnet? | Deploy target | Ask on Discord, day 1 |
| Q2 | Is there a testnet AUSD faucet? | Without it the pool cannot be funded | **Yes, but empty.** Agora's faucet `0xd236c18d274e54faccc3dd9dda4b27965a73ee6c` drips 10,000 AUSD per `requestFunds(address)` (60 s apart, up to 100,000 held) and has reverted `InsufficientFunds()` since 25 Sep. Ask Agora to refill it or send AUSD to the deployer. Until then: TestAUSD, clearly labelled |
| Q3 | Xendit test: MYR (Malaysia) + IDR disbursement from one account? | Decides the persona | If not: top up in IDR, keep cross-border via disbursement to another supported country, or flip the story (family in ID sends to Siti in MY) |
| Q4 | Does a PWA count as the "mobile application" Agora asks for? | Native app vs PWA | Ask on day 1. Fallback: Mera has a React Native recipe, but only if they insist |
| Q5 | earnAUSD is not on testnet | Yield is mock-only | Real mechanism in the contract, mock vault stated plainly |
| Q6 | Is the Record ramp (N=3) too slow for the demo? | Small limit jump on stage (100 → 108.61) | Also show the aged account (134.52); do not weaken the anti-farming standard |
| Q7 | Agora partner yield-sharing programme | Extra business model (roadmap) | Mention in the write-up; negotiated per partner |
| Q8 | Can we get sandbox access to Agora's Routes API? Docs list production only | D12 stays a write-up item unless we can call it | Ask Agora with Q1 and Q2 |
| R1 | Card chargebacks | Pool losses | Contract hold + `cancelPending` + 3DS + debit only + amount caps. Chargebacks after the hold (up to ~120 days) remain an operator loss |
| R2 | Relayer key leak | Fake deposits, drained drip funds | Minimum roles, daily caps, pause, reconciliation |
| R3 | Vault value drops | Limit drops, user may go over-limit | Block new draws, no auto-default |
| R4 | Judges: "Why not just use a bank?" | Pitch | `/verify` + cross-border history + interest-free + instant send |
| R5 | User loses their passkey | Account and collateral unreachable | Synced passkeys; roadmap: KYC-gated wallet rebind with a timelock |
| R6 | Track 02 is crowded; "Mera + AUSD" is the default stack and at least one public entry targets the same Agora bounty | Hard to stand out | Lead with what others lack: credit that grows and a record that moves home with her |

---

## 14. Submission checklist

- [ ] Public repo shared with `metropolis@hackathon.monad.xyz`, **honest git history starting 29 Sep 2026** (no backdating)
- [ ] README: pitch, how to try it, contract addresses, architecture
- [ ] `TRUST.md` (§9)
- [ ] A hand-checkable limit calculation example (§6.3)
- [ ] Live app (Vercel) + judge instructions: create a passkey, Didit sandbox auto-approves, Xendit test card numbers, a pre-funded "Mom" account
- [ ] Demo video ≤ 3 minutes following §3, live product only
- [ ] Pitch video ≤ 2 minutes: team, problem, why us
- [ ] Logo (JPG/PNG/WEBP, ≤ 3 MB)
- [ ] User-testing results in the write-up (§2.1)
- [ ] Contracts verified on the Monad testnet explorer
- [ ] Bounty fields: Agora, Community (DevWeb3Jogja), Envio

---

## 15. Out of scope (roadmap)

- Real physical/virtual card through a licensed issuer
- Rebalancing collateral across multiple vaults
- Cross-chain crypto collateral
- Credit passport read by other protocols / partner banks
- Passkey recovery via KYC-gated rebind
- Native mobile app, WhatsApp notifications
- Licensing (OJK, Bank Indonesia, Malaysian regulators)
