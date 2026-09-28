# Matocard indexer

[Envio HyperIndex](https://docs.envio.dev/docs/HyperIndex/overview) over the Matocard credit line on Monad testnet, synced through HyperSync. It serves the app's activity feed, the public `/verify` page and the payments service's daily reconciliation.

| | |
|---|---|
| Chain | Monad testnet (`10143`) |
| Contract | `MatoCreditLine` proxy [`0x39BE…9C59`](https://testnet.monadvision.com/address/0x39BED14767138AbA87d1F07b64088e1042239C59) |
| Start block | `66373390` (proxy deployment) |

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

## Development

```sh
bun run codegen    # after any change to schema.graphql or config.yaml
bun run test       # simulated events, no network needed
bun run dev        # local indexer, needs Docker and ENVIO_API_TOKEN
```

`INDEXER_LIVE_TEST=1 bun test test/live.test.ts` replays the real first cycle from Monad testnet (needs `ENVIO_API_TOKEN`).

`test/event-parity.test.ts` fails if the contract emits an event this indexer does not handle, or the other way round. Update `config.yaml` and the handler together with `IMatoCreditLine.sol`.
