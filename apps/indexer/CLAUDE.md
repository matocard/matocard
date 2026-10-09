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
  oldest URL. Update every copy together: `INDEXER_URL` in **`apps/indexer/.env.example`** (the
  health check reads this one, so a stale value means it watches the wrong deployment),
  `INDEXER_URL` in `apps/backend/.env.example`, this folder's `README.md`, the root `README.md`,
  and `docs/developers/indexer.mdx` and `docs/resources/contracts.mdx`. Then tell the app and
  backend owners.
- **A health check** (`.github/workflows/indexer-health.yml`, `scripts/health.sh`) opens an issue
  when the hosted indexer is 1,500+ blocks behind and closes it on recovery. GitHub runs it every
  few hours, not every 30 minutes, so check `_meta` by hand before a demo. If Envio Cloud stalls,
  `docker compose up -d --build` here runs the same indexer self-hosted.
- **Envio Cloud builds from the `envio` branch**, not `main`: `git push origin main:envio`, then
  promote the commit. A new deployment can sit at block 0 for well over ten minutes before it starts; give it time before redeploying.
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
