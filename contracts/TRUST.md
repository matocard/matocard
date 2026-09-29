# Trust model

What a borrower or lender has to trust, who they are trusting, and what bounds it. Every statement here was checked against the code in `src/`. Nothing here has been audited.

## At a glance

| Part | Trusted party | Bounded by |
|---|---|---|
| Score, limit, cycle rules, default | **Nobody.** The contract, recomputable by anyone | Code, and the admin's upgrade power below |
| Fiat in and out (card, bank, payouts) | **Operator**, custodial | The relayer's narrow role, daily reconciliation against indexed events |
| Identity | **Operator** + the KYC provider | Only a hash goes on chain; one hash per wallet, forever |
| Collateral yield | The yield vault (testnet: a mock) | Vault risk is the borrower's and the pool's |
| Rules themselves | **Admin**, through parameters and upgrades | Two-step handover with a one-day delay. No timelock on anything else yet |
| Lenders' capital | Borrowers with high scores | The yield fee is the price of that risk |

## Roles

| Role | Can | Cannot |
|---|---|---|
| Admin (`DEFAULT_ADMIN_ROLE`) | Upgrade the implementation, pause, change every parameter, grant and revoke roles | Nothing is out of reach through an upgrade. See below |
| `KYC_ROLE` | `setVerified(wallet, identityHash)` | Unbind or rebind a wallet or an identity once bound |
| `RELAYER_ROLE` | `depositFor` (pulls AUSD from its own balance), `cancelPending` | Move settled collateral, pool AUSD or anyone's debt. `cancelPending` reaches only card top-ups still inside their hold, and returns them to the relayer |
| Anyone | `repayFor`, `settlePending`, `markDefaulted` once overdue, `redeemPoolShares` | Anything that takes value from someone else |

**On testnet one key holds all three roles** (`0x3B4f…85F5`, the deployer), so every trusted party above is currently the same key. Production splits them: admin behind a multisig and timelock, the KYC and relayer roles on the services' own keys with daily caps.

## What the admin can change, and when it bites

Parameters are read at different moments, so a change does not affect every loan the same way:

| Parameter | Fixed per loan when | A change affects |
|---|---|---|
| `term`, `grace` | the first draw of a cycle (`dueAt`, `defaultableAt` are stored) | new cycles only |
| `minCycleDuration`, `minUtilizationBps` | the first draw of a cycle (stored on the account) | new cycles only |
| `cardHold` | the top-up (`pendingUntil` is stored) | new top-ups only |
| `yieldFeeBps` | **not fixed**, applied when collateral next changes | yield already earned but not yet charged |

Grace and the cycle rules were read late in the first implementation, which let a change reach open loans; the upgrade described in the contracts README fixed them per cycle. The yield fee is still read late.

`setParams` rejects only a zero term and bps above 100%. An upgrade can change any rule, including moving funds. That is why the production admin must sit behind a timelock long enough for users to repay and leave.

## Pause

Pausing stops new risk and nothing a user needs to get out of debt.

| Paused | Never paused |
|---|---|
| `draw`, `depositFor`, `depositCollateral`, `withdrawCollateral` | `repay`, `repayWithPermit`, `repayFor`, `repayFromCollateral`, `markDefaulted`, `settlePending`, `cancelPending`, `redeemPoolShares`, lender deposits and withdrawals |

`markDefaulted` also keeps running, so a long pause does not extend a due date. Repayment stays open throughout, so no one is defaulted for want of a way to pay.

## Money flows

**Fiat is custodial.** A card or bank top-up is paid to the operator; the relayer then credits the equivalent AUSD with `depositFor`. Between those two steps the operator holds the money. The payments service reconciles each UTC day's `CREDITED_ONCHAIN` total against the indexer's `DailyTopUp.relayerAssets`.

**Card hold.** A card top-up counts toward the limit only after `cardHold` (60 s on testnet, 7 days planned). The contract picks the hold from the method; the relayer cannot shorten it. Chargebacks inside the hold are reversed with `cancelPending`. Chargebacks after it are the operator's loss, not the pool's.

**Draws** go to any address the borrower names: a family member's account, the payout treasury, a merchant.

## Lenders' risk

The collateral ratio falls from 150% at score 0 to 80% at score 100, and crosses 100% at **score 72**. From there a limit is larger than the collateral behind it. If a borrower defaults owing more than their collateral is worth, `markDefaulted` seizes all of it and the shortfall is written off against the pool. The pool's income for carrying this is `yieldFeeBps` (20%) of borrowers' collateral yield. Borrowing itself is interest-free.

A default seizes vault shares worth the debt, rounded up, and no more. The rest remains the borrower's to withdraw. The account keeps its record and can never draw again. One identity cannot open a second account.

Lenders can withdraw only AUSD that is not lent out (`maxWithdraw` is capped at `idle`).

## Vault risk

Collateral is held as shares of an ERC4626 vault over AUSD. On testnet that is **MockEarnAUSD**, a plain vault whose yield is whatever the operator pays in. On mainnet it would be earnAUSD, whose yield comes from trading strategies, whose withdrawals can queue for up to 72 hours, and which can lose value.

If the vault's share price falls, limits fall with it. New draws are blocked while a borrower is over their limit, but nobody is defaulted early because of it; default only follows a missed due date. Seizing shares on default is instant even if the vault's withdrawals are queued.

## Testnet stand-ins

| On testnet | Stands in for | Why |
|---|---|---|
| TestAUSD `0x0c24…4f79` | AUSD | No testnet AUSD faucet. Anyone can mint it; it is worth nothing and its name says so |
| MockEarnAUSD `0xe6a5…EBee` | earnAUSD | earnAUSD is mainnet only |

## What has been checked

- 108 Foundry tests, 100% line, branch and function coverage of `src/` (testnet tokens excluded): unit tests per module, every refusal path, the demo figures as literals, an upgrade test that checks every module's state survives, and invariants over random activity (all vault shares assigned to a borrower or the pool, `totalDrawn` equal to the sum of debts, `idle` backed by real AUSD, scores within 0 to 100).
- Two live cycles on Monad testnet with every figure read back from the chain: [docs/e2e-testnet-run.md](../docs/e2e-testnet-run.md).
- [Slither](https://github.com/crytic/slither) 0.11.6 runs in CI and fails on any finding. The first run found 15, all triaged:
  - 3 reentrancy findings where state is written after a call to the yield vault, and 1 after `repayWithPermit` calls the pool asset's `permit`. Every entry point is `nonReentrant`, and the vault and asset are fixed at initialisation; each is suppressed on its own line with that reason.
  - 5 uses of `block.timestamp`: holds and due dates are minutes to days long.
  - 5 uses of assembly: the ERC-7201 storage pointers, one per module.
  - 2 names: OpenZeppelin's `__Module_init` convention.
- Not audited by a third party.
