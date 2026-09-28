# Matocard indexer

[Envio HyperIndex](https://docs.envio.dev/docs/HyperIndex/overview) over the Matocard credit line on Monad testnet, synced through HyperSync. It serves the app's activity feed, the public `/verify` page and the payments service's daily reconciliation.

| | |
|---|---|
| Chain | Monad testnet (`10143`) |
| Contract | `MatoCreditLine` proxy [`0x39BE…9C59`](https://testnet.monadvision.com/address/0x39BED14767138AbA87d1F07b64088e1042239C59) |
| Start block | `66373390` (proxy deployment) |
| GraphQL | `https://indexer.dev.hyperindex.xyz/f7806e8/v1/graphql` (Envio Cloud, deployment `44823cb`) |

## Entities

| Entity | Use |
|---|---|
| `Account` | Score, counters, outstanding balance, card top-ups on hold, lifetime totals |
| `Activity` | One row per event for an account: the history screen |
| `Cycle` | Each borrowing cycle with dates, peak, repayments and outcome: the `/verify` page |
| `ScoreChange` | Every score the contract reported, with the reason |
| `DailyTopUp` | Top-ups per UTC day, relayer and direct kept apart, plus reversals: reconciliation |
| `Pool` | Line-wide totals: outstanding, lifetime drawn / repaid / written off, lender flows |

Scores come from the contract's own events and are never recomputed here. Limits are not stored, because collateral yield moves them without an event: read `limitOf` from the contract for a live figure.

## Queries

```graphql
# history screen
{ Activity(where: { account_id: { _eq: "0x…" } }, order_by: { timestamp: desc }) {
    kind amount counterparty method timestamp txHash } }

# /verify
{ Account_by_pk(id: "0x…") { score cycleCount repayCount defaulted
    cycles(order_by: { number: asc }) { number outcome openedAt closedAt peakDrawn } } }

# reconciliation
{ DailyTopUp_by_pk(id: "2026-09-28") { relayerAssets relayerCount reversedShares } }
```

## Deploying

Envio Cloud builds from the `envio` branch, not `main`, so unrelated merges do not use up deployments (the development plan keeps three). To ship indexer changes:

```sh
git push origin main:envio
bunx envio-cloud indexer commits matocard matocard       # wait for "active"
bunx envio-cloud deployment promote matocard <commit> matocard
```

Every deployment gets a new URL. Update the GraphQL row above and tell the app and API owners when it changes. Check progress with a `_meta { progressBlock isReady }` query: `envio-cloud deployment metrics` has shown 0% for a deployment that was fully synced.

## Self-hosting

The same stack `envio dev` runs (Postgres 18, Hasura 2.43, the indexer), for when a hosted deployment is unavailable:

```sh
cp .env.example .env   # ENVIO_API_TOKEN, POSTGRES_PASSWORD, HASURA_ADMIN_SECRET
docker compose up -d --build
```

GraphQL is on `http://localhost:8080/v1/graphql`; reads need no secret. The indexer keeps its progress in Postgres, so a restart resumes from the last checkpoint rather than from the start block. Put Hasura behind HTTPS before exposing it.

## Development

```sh
bun run codegen    # after any change to schema.graphql or config.yaml
bun run test       # simulated events, no network needed
bun run dev        # local indexer, needs Docker and ENVIO_API_TOKEN
```

`INDEXER_LIVE_TEST=1 bun test test/live.test.ts` replays the real first cycle from Monad testnet (needs `ENVIO_API_TOKEN`).

`test/event-parity.test.ts` fails if the contract emits an event this indexer does not handle, or the other way round. Update `config.yaml` and the handler together with `IMatoCreditLine.sol`.
