# @matocard/backend

Owner: Kiel. `api`, `kyc`, `payments` and `relayer` (PLAN §7) in one Bun process with Postgres.
`README.md` has the run instructions and the full route table; this file is what costs time.

```sh
docker compose up -d postgres && bun run dev    # needs .env, see .env.example
bun test                                        # DATABASE_URL; relayer + e2e tests also need anvil and forge
```

## Files

| | |
| --- | --- |
| `src/index.ts` | wiring, the single worker loop (every 5 s and on each webhook), daily reconciliation |
| `src/api.ts` | routes, `authenticate`, `sessionMessage`, indexer client |
| `src/chain.ts` | contract reads and the relayer, the only code that sends transactions |
| `src/payments.ts` | Xendit top-up, settlement, cash-out, webhooks |
| `src/kyc.ts` | Didit session, webhook, `identityHash`, `setVerified` + MON drip |
| `src/fx.ts` | quotes locked 60 s, rates from Frankfurter (ECB) |
| `src/reconcile.ts` | the day's credited totals against the indexer |
| `migrations/` | schema; the database enforces the money rules (state machine, append-only ledger) |

## What the app has to know

- **Auth is a signature, not a password.** The account signs `sessionMessage(wallet, until)` from
  `src/api.ts` (`until` at most 7 days ahead) and sends
  `Authorization: Matocard <wallet>.<until>.<signature>`. The first signed request creates the user.
- **Amounts are decimal strings in the smallest unit**, both ways (bigints are stringified in
  `http.ts`). `POST /topups` is the exception on input: `amount` is a MYR decimal such as `"600.00"`.
- **Errors are `{ error }`** with a 4xx for anything the caller can fix, and the contract's revert
  reason when the relayer's dry run refused it.
- **`/topups` and `/sends` need `kyc === "approved"`.** KYC stays `pending` until the identity hash
  is onchain, which the worker does after Didit's webhook.
- **`/settlements` charges the whole debt** in MYR, rounded up. A partial repayment is a user
  transaction (`repayWithPermit`, `repayFromCollateral`), not a backend route.
- **A cash-out authorization must pay the relayer's address**, which no route returns yet.
- **No CORS.** Routes answer only GET and POST and send no CORS headers.
- Without Xendit or Didit keys those routes answer 503; the rest still works.

## How money moves

Webhooks only record what happened and answer at once; the worker does every onchain step, one at
a time, from one key with a locally tracked nonce and the published gas limits. Each relayer
transaction is logged in `relayer_txs` before it is sent, dry-run first, and read back after. It is
never resent while an earlier one for the same payment is sent or confirmed: that is for a person.

The card hold follows the channel Xendit reports, not what the app asked for; unknown channels
count as card, the longest hold.

## Not verified against the live providers

Xendit Payment Sessions, v2 payouts and Didit v3 were written from docs and tested against fakes.
Collecting MYR and paying IDR likely need two Xendit accounts (`XENDIT_PAYOUT_SECRET_KEY`). Didit's
sandbox gives every tester the same document, so in sandbox the identity hash also includes the
wallet.
