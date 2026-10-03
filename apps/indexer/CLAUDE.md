# @matocard/indexer

Owner: Fajar. Envio HyperIndex over the `MatoCreditLine` proxy on Monad testnet, synced through
HyperSync. Serves the activity feed, `/verify` history and daily reconciliation. `README.md` has the
entities, sample queries and the live GraphQL URL.

```sh
bun run codegen    # after any change to schema.graphql or config.yaml
bun run test       # simulated events, no network
```

## What will cost you time

- **The URL changes on every deployment**, and the dev tier keeps three, so a redeploy deletes the
  oldest URL. `README.md` is the record; update it, `INDEXER_URL` in `apps/backend/.env.example`,
  and tell the app and backend owners together.
- **Envio Cloud builds from the `envio` branch**, not `main`: `git push origin main:envio`, then
  promote the commit. A new deployment can sit at block 0 for ten minutes before it starts.
- **Check progress with `_meta { progressBlock isReady }`**, not `envio-cloud deployment metrics`,
  which has shown 0% for a fully synced deployment.
- **Only the credit line's events are indexed.** A plain AUSD transfer (a draw lands as AUSD in
  Mom's account, or an ERC-3009 send) is not an `Activity` for the receiver. Read those from AUSD.
- **Scores come from the contract's events, never recomputed here; limits are not stored**, because
  vault yield moves them without an event. Read `limitOf` from the chain.
- `test/event-parity.test.ts` fails when the contract and `config.yaml` disagree about events.
  Change `IMatoCreditLine.sol`, `config.yaml` and the handler together.
- The public Monad RPC caps `eth_getLogs` at 100 blocks, too narrow to sync from; that is why this
  uses HyperSync.
