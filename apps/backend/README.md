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

1. **DNS:** an `A` record `api` → `201.18.211.8` in the `matocard.xyz` zone.
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
   cp .env.example .env && chmod 600 .env      # fill in, and uncomment COMPOSE_FILE
   docker compose up -d --build
   curl https://api.matocard.xyz/health
   ```
4. **Webhooks:** Didit → a webhook destination `https://api.matocard.xyz/webhooks/didit` subscribed to `status.updated`; its secret is `DIDIT_WEBHOOK_SECRET`. Xendit → `https://api.matocard.xyz/webhooks/xendit`; its callback token is `XENDIT_CALLBACK_TOKEN`.
5. **Chain:** on Monad testnet, `RELAYER_PK` needs `KYC_ROLE` and `RELAYER_ROLE` on the credit line and holds the treasury's AUSD, plus MON for gas and drips.

Postgres and the backend listen on localhost only; Caddy is the one public door. The code reaches the VPS with `git archive <branch> | ssh root@201.18.211.8 'tar -x -C /opt/matocard'` (`.env` is not in git, so it stays), then `docker compose up -d --build`.

## API

**Swagger: [`https://api.matocard.xyz/docs`](https://api.matocard.xyz/docs)**, from [`openapi.json`](openapi.json): every route with its request, response and errors, how to sign in, and the ERC-3009 domain. A test fails if a route is missing from it.

Signed-in routes take `Authorization: Matocard <wallet>.<until>.<signature>`, where the account signs `sessionMessage(wallet, until)` from `src/api.ts` (at most 7 days ahead). Amounts are strings in the smallest unit (AUSD: 6 decimals, MYR: sen, IDR: rupiah).

Every route answers CORS preflight and allows any origin: sessions ride in a header, never a cookie.

| Route | | |
|---|---|---|
| `GET /health` | public | |
| `POST /quote` | public | `{ pair: "USD/MYR" \| "USD/IDR" }` → rate locked for 60 s |
| `GET /verify/:wallet` | public | score, ratio, cycles, history from the indexer; nothing personal |
| `GET /me` | signed | home screen: limit, available, score, ratio, collateral, yield, debt, AUSD balance |
| `GET /me/activity` | signed | indexer activity plus payments and payouts not yet onchain |
| `POST /kyc/session` | signed | Didit URL to open |
| `POST /topups` | signed, verified | `{ amount: "2400000", method, quoteId }` (IDR, quote `USD/IDR`) → Xendit checkout URL |
| `POST /settlements` | signed | `{ quoteId }` (`USD/IDR`) → checkout for the whole debt in IDR, rounded up |
| `POST /sends` | signed, verified | `{ authorization }`: an ERC-3009 transfer the sender signed; relayer pays gas |
| `POST /cashouts` | signed | `{ quoteId, authorization (to the treasury), bank: { channelCode, accountNumber, accountHolderName } }` |
| `POST /webhooks/xendit` | `x-callback-token` | payments, refunds, disputes, payouts |
| `POST /webhooks/didit` | HMAC `x-signature` | verification results |

## How money moves

Webhooks only record what happened and answer at once. A worker loop in the same process does every onchain step, one at a time: bind identities and drip MON, credit paid top-ups (`depositFor`), repay settlements (`repayFor`), take back charged-back deposits still in their hold (`cancelPending`), and send cash-outs (ERC-3009 to the treasury, then a Xendit payout). A crash between the two halves leaves a `PAID` payment that the next run picks up.

The relayer logs every transaction in `relayer_txs` before sending it, dry-runs it first (a revert costs nothing and comes back with the contract's error), keeps its own nonce, sends the published gas limits, and reads back the state each call was meant to change. It never resends for a payment that already has a sent or confirmed transaction: that is left for a person.

The hold follows how the payer actually paid (the channel in Xendit's webhook), not what the app asked for. Unknown channels count as card, the longest hold.

## Rules the database enforces (PLAN §7.2)

- Money is `bigint` in the currency's smallest unit, with the currency beside it. Helpers in `@matocard/core`.
- `payments.provider_event_id` is unique, and each webhook delivery is recorded once in `webhook_events`.
- A payment moves only `PENDING → PAID → CREDITED_ONCHAIN → SETTLED | REVERSED`, `PAID → REVERSED` (chargeback before credit), or `PENDING → FAILED`. A trigger refuses anything else and logs every step in `payment_transitions`.
- `ledger` and `payment_transitions` are append-only; payments are never deleted. Every posting is one side of a double entry, and each currency balances.

## Relayer health

The relayer pays every backend transaction's gas and drips `DRIP_MON` to each new user, so sign-ups stop when it runs dry. `.github/workflows/relayer-health.yml` runs `scripts/relayer-health.sh` every hour: under 2 MON it opens an issue, *Relayer is low on MON*, and closes it once topped up. `DRY_RUN=1 scripts/relayer-health.sh` only prints.

## Reconciliation

`bun src/reconcile.ts [YYYY-MM-DD]` compares the day's credited top-ups and repayments with the indexer, and exits 1 on any difference. The server runs it for the previous day shortly after midnight UTC when `INDEXER_URL` is set.

## Not verified against the live providers yet

Written from Xendit's and Didit's docs, tested against fakes:

- Xendit Payment Sessions and v2 payouts. The QR method is inferred from any channel containing `QR` (QRIS), bank from `*_VIRTUAL_ACCOUNT`; anything else (cards, e-wallets) gets the card hold.
- Top-ups and settlements are in IDR through one Indonesian Xendit account (`COLLECT` in `src/payments.ts`). Collecting MYR needs a Malaysian account; `XENDIT_PAYOUT_SECRET_KEY` is for a second account if that happens.
- Didit v3 sessions and webhooks. Its sandbox gives every tester the same document, so in sandbox the identity hash also includes the wallet.
