# Backend

`api`, `kyc`, `payments` and `relayer` (PLAN §7) in one Bun process, with Postgres. Runs in Docker; the Hostinger VPS runs the same compose file (#50), live at `https://api.matocard.xyz`.

## Run on localhost

```sh
cp .env.example .env                  # set POSTGRES_PASSWORD, DATABASE_URL, IDENTITY_SALT
scripts/local-chain.sh                # anvil + the real contracts + treasury AUSD; paste what it prints into .env
docker compose up -d --build          # Postgres + backend on 127.0.0.1:$PORT
curl 127.0.0.1:3000/health
```

`scripts/local-chain.sh` needs Foundry and `forge install` in `contracts/`. From inside Docker use `RPC_URL=http://host.docker.internal:8545`. Against Monad testnet instead, leave the chain variables at their defaults and set `RELAYER_PK` to a key with `KYC_ROLE` and `RELAYER_ROLE` that holds AUSD.

Without Xendit or Didit keys the backend still runs; those routes answer 503.

For development, run only the database in Docker:

```sh
docker compose up -d postgres
bun run dev
bun test          # needs DATABASE_URL; the relayer and end-to-end tests also need anvil and forge
```

## Deploy to the VPS

The Hostinger VPS already runs a Caddy for its other sites (`/opt/portir/apps/portiragent/deploy`), which holds 80 and 443 and gets certificates from Let's Encrypt on its own. It serves `https://api.matocard.xyz` as well: `docker-compose.vps.yml` puts the backend on that Caddy's network as `matocard-api`, and adds a daily `pg_dump` into `backups/` (14 days kept).

1. **DNS:** an `A` record `api` → the VPS's address, in the `matocard.xyz` zone.

The VPS's address and SSH access are not in this repository; ask the backend owner. Below, `<vps>` stands for that SSH host.
2. **That Caddy's Caddyfile** has:
   ```
   api.matocard.xyz {
   	encode gzip
   	reverse_proxy matocard-api:3000
   }
   ```
   then `docker exec deploy-caddy-1 caddy validate --config /etc/caddy/Caddyfile && docker exec deploy-caddy-1 caddy reload --config /etc/caddy/Caddyfile`.
3. **On the VPS:**
   ```sh
   cd /opt/matocard/apps/backend
   cp .env.example .env && chmod 600 .env      # fill in, uncomment COMPOSE_FILE, APP_URL=https://app.matocard.xyz
   docker compose up -d --build
   curl https://api.matocard.xyz/health
   ```
4. **Webhooks:**
   - Didit: a webhook destination `https://api.matocard.xyz/webhooks/didit` subscribed to `status.updated`; its secret is `DIDIT_WEBHOOK_SECRET`.
   - Xendit (Settings → Webhooks): `https://api.matocard.xyz/webhooks/xendit` on **Payment Session** (completed, expired), **Payment Requests V3** (payment status), **Payouts v2** and **Unified Refunds** (refund succeeded). The verification token on that page is `XENDIT_CALLBACK_TOKEN`. Leave the v1 *Disbursement* hooks off: the backend uses v2 payouts.
   - Xendit's Malaysian account: the same URL on **Payment Session**, **Payment Requests V3** and **Unified Refunds**; its token is `XENDIT_MY_CALLBACK_TOKEN`.
5. **Chain:** on Monad testnet, `RELAYER_PK` needs `KYC_ROLE` and `RELAYER_ROLE` on the credit line and holds the treasury's AUSD, plus MON for gas and drips.

Postgres and the backend listen on localhost only; Caddy is the one public door.

**Shipping a change.** Merge to `main` first, then from the repository root:

```sh
git archive main | ssh <vps> 'tar -x -C /opt/matocard'    # .env is not in git, so it stays
ssh <vps> 'cd /opt/matocard/apps/backend && docker compose up -d --build'
```

**Check the build, not `/health`.** If the image fails to build, compose keeps the old container running and `/health` stays green. Read the build's exit code, then look inside the running container (`docker exec matocard-backend-backend-1 grep … src/…`) or call the route you changed. A new workspace in the repository needs its `package.json` copied in `Dockerfile` before the frozen install; a test fails until it is.

## API

**Swagger: [`https://api.matocard.xyz/docs`](https://api.matocard.xyz/docs)**, from [`openapi.json`](openapi.json): every route with its request, response and errors, how to sign in, and the ERC-3009 domain. A test fails if a route is missing from it.

Signed-in routes take `Authorization: Matocard <wallet>.<until>.<signature>`, where the account signs `sessionMessage(wallet, until)` from `src/api.ts` (at most 7 days ahead). Amounts are strings in the smallest unit (AUSD: 6 decimals, IDR: rupiah, MYR: sen). Top-ups and settlements move in IDR or MYR, picked by the quote's pair; cash-outs in IDR.

**Verified** below means verified onchain (`isVerified` on the credit line), the same `verified` that `GET /me` returns. `user.kyc` is only our record of Didit's decision: the demo accounts were verified onchain without Didit and keep `kyc: "none"`.

Every route answers CORS preflight and allows any origin: sessions ride in a header, never a cookie.

| Route | | |
|---|---|---|
| `GET /health` | public | |
| `GET /docs`, `GET /openapi.json` | public | Swagger UI and the spec |
| `POST /quote` | public | `{ pair: "USD/IDR" \| "USD/MYR" }` → rate locked for 60 s |
| `GET /verify/:wallet` | public | score, ratio, cycles, history from the indexer; nothing personal |
| `GET /me` | signed | home screen: limit, available, score, ratio, collateral, yield, debt, AUSD balance, card number |
| `POST /me/country` | signed | `{ country: "MY" }`, ISO two letters |
| `GET /me/activity` | signed | indexer activity plus payments and payouts not yet onchain |
| `POST /kyc/session` | signed | Didit URL to open; Didit sends the user back to `APP_URL` |
| `POST /topups` | signed, verified | `{ amount: "2400000", method, quoteId }`: rupiah with a `USD/IDR` quote (at least Rp 10,000), sen with `USD/MYR` (at least RM 5) → Xendit checkout URL |
| `POST /settlements` | signed | `{ quoteId }` (`USD/IDR` or `USD/MYR`) → checkout for the whole debt in that currency, rounded up |
| `POST /sends` | signed, verified | `{ authorization }`: an ERC-3009 transfer the sender signed; relayer pays gas |
| `POST /cashouts` | signed | `{ quoteId, authorization (to the treasury), bank: { channelCode, accountNumber, accountHolderName } }` → IDR payout, at least Rp 10,000 |
| `POST /webhooks/xendit` | `x-callback-token` | payments, refunds, disputes, payouts |
| `POST /webhooks/didit` | HMAC `x-signature` | verification results |

## How money moves

Webhooks only record what happened and answer at once. A worker loop in the same process does every onchain step, one at a time: bind identities and drip MON, credit paid top-ups (`depositFor`), repay settlements (`repayFor`), take back charged-back deposits still in their hold (`cancelPending`), and send cash-outs (ERC-3009 to the treasury, then a Xendit payout). A crash between the two halves leaves a `PAID` payment that the next run picks up.

The relayer logs every transaction in `relayer_txs` before sending it, dry-runs it first (a revert costs nothing and comes back with the contract's error), keeps its own nonce, sends the published gas limits, and reads back the state each call was meant to change. It never resends for a payment that already has a sent or confirmed transaction: that is left for a person.

The hold follows how the payer actually paid, not what the app asked for: virtual accounts, FPX and DuitNow count as bank (no hold), QRIS as QR, and cards, e-wallets and anything unknown as card, the longest hold. `payment_session.completed` does not carry the channel, so it is read from the session's payment request at Xendit.

A refund or chargeback marks its top-up; inside the hold the worker takes the deposit back with `cancelPending`, after it the amount is booked as an operator loss (`loss:chargeback`). Xendit's `refund.succeeded` names the payment request (`pr-…`) in `payment_id`, so it is resolved to the payment first. One that matches no top-up is logged.

## Rules the database enforces (PLAN §7.2)

- Money is `bigint` in the currency's smallest unit, with the currency beside it. Helpers in `@matocard/core`.
- `payments.provider_event_id` is unique, and each webhook delivery is recorded once in `webhook_events`.
- A payment moves only `PENDING → PAID → CREDITED_ONCHAIN → SETTLED | REVERSED`, `PAID → REVERSED` (chargeback before credit), or `PENDING → FAILED`. A trigger refuses anything else and logs every step in `payment_transitions`.
- `ledger` and `payment_transitions` are append-only; payments are never deleted. Every posting is one side of a double entry, and each currency balances.

## Relayer health

The relayer pays every backend transaction's gas and drips `DRIP_MON` to each new user, so sign-ups stop when it runs dry. `.github/workflows/relayer-health.yml` runs `scripts/relayer-health.sh` every hour: under 2 MON it opens an issue, *Relayer is low on MON*, and closes it once topped up. `DRY_RUN=1 scripts/relayer-health.sh` only prints.

## Reconciliation

`bun src/reconcile.ts [YYYY-MM-DD]` compares the day's credited top-ups and repayments with the indexer, and exits 1 on any difference. The server runs it for the previous day shortly after midnight UTC when `INDEXER_URL` is set, and writes the result to its log only: `docker logs matocard-backend-backend-1 | grep -i reconcil`. 30 Sep shows a difference that is expected: three top-ups (310 AUSD) credited with the deployer's key by the demo scripts and test runs, outside the backend, so the database has none.

## Checked against the live providers

Run on `https://api.matocard.xyz` on 3–4 Oct 2026, Xendit in test mode, Didit sandbox, Monad testnet, real AUSD (#69, #76):

- **Didit:** session, approval webhook, `setVerified` and the MON drip onchain. Didit's sandbox gives every tester the same document, so in sandbox the identity hash also includes the wallet
- **Xendit money in:** Payment Sessions in IDR, by BCA and BRI virtual account (simulated payment) and by test card. The card was held, the virtual accounts were not
- **Xendit money out:** a v2 payout to `ID_BCA`, `ACCEPTED` then `DISBURSED` by webhook
- **Refund** of a card top-up after its hold: booked as an operator loss
- **Onchain:** `depositFor`, `draw` by the user, a gasless ERC-3009 send, `repayFor`, the score moving 0 → 17, and `/verify` reading the cycle from the indexer
- **Ringgit, through the Malaysian account** (4 Oct, #79): a RM 200 top-up by FPX (`AFFIN_FPX`, counted as bank, no hold) credited 48.97 AUSD with `depositFor`; a RM 40.85 settlement by DuitNow QR (`DUITNOW_QR`) repaid a 10 AUSD draw with `repayFor`, score 17 → 33. Both booked in MYR in the ledger

**Not checked live:**
- A refund or chargeback *inside* the hold (`cancelPending`): the testnet hold is about a minute, too short to refund from the dashboard. The flow test covers it with Xendit's real payload
- Dispute webhooks (`dispute.*`): none raised in our tests; they are handled like a refund
- QRIS and e-wallet payments, and payouts to banks other than BCA

**Two Xendit accounts.** Xendit ties an account to its country, so there is one per currency (`COLLECT` in `src/payments.ts`). The Indonesian one (`XENDIT_SECRET_KEY`) collects IDR and pays every cash-out, since the families are in Indonesia. The Malaysian one (`XENDIT_MY_SECRET_KEY`) collects MYR. The quote's pair picks the account; a webhook's token says which account sent it, so refunds are looked up there.
