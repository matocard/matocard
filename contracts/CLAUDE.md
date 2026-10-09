# contracts

Owner: Fajar. Foundry, Solidity 0.8.30, OpenZeppelin 5.4. `README.md` has deployments, the limit
formula and deploy/upgrade commands; `TRUST.md` has who can do what.

```sh
forge build && forge test && forge fmt --check
```

## Shape

One UUPS proxy, `MatoCreditLine`, composed of modules: `Governed` (roles, pause, params, upgrades),
`PoolModule` (lenders' ERC4626 over AUSD), `IdentityModule` (one identity hash per wallet, both
ways), `CollateralModule` (yield-vault shares, card hold, yield fee) and `CreditModule` (draw,
repay, default, score, limit). `CreditScoring` is a pure library. Events and errors for the app and
indexer are all in `src/interfaces/IMatoCreditLine.sol`.

**Always talk to the proxy** (`0x4D6279c3DD0369e788C33b3aE1297D4E9abbd01a`), never the
implementation.

## Rules that are easy to break

- **Each module keeps its state in its own ERC-7201 namespace.** New state goes at the end of a
  module's struct or namespace, never between existing fields. `CreditAccount` already has fields
  appended by the second implementation; keep appending below them.
- **After any contract change run `script/export-abi.sh`.** CI fails when
  `packages/contracts/src/abi` is stale.
- **Gas limits are published, not estimated** (`packages/contracts/src/gas-limits.json`), because
  Monad charges the limit. A Foundry test fails when a call outgrows its limit; re-measure on testnet
  after changing a hot path.
- **Slither fails CI on any finding.** A triaged finding is suppressed on its own line with the
  reason above it, and recorded in `TRUST.md`.
- **A redeploy moves several places at once**: `packages/contracts/src/addresses.ts`, the indexer's
  `config.yaml` (address and start block) and its live replay test, the READMEs, and the docs site
  (`docs/resources/contracts.mdx`). The package tests catch a mismatch between the package, the
  indexer config and the contracts README; the rest is by hand. A new indexer deployment follows,
  see `apps/indexer/CLAUDE.md`.
- `repay`, `repayWithPermit`, `repayFor`, `repayFromCollateral` and `markDefaulted` are never
  paused. Keep it that way.
- Monad has no global mempool: deploy and run scripts with `--slow`.

## Testnet behaviour the app sees

`minCycleDuration` and `cardHold` are 60 s. A qualifying cycle is repaid to zero by `dueAt`, lasts at
least `minCycleDuration`, and uses at least 10% of the limit; anything else settles the debt and
scores nothing, with no error. `availableOf` is 0 for an unverified or defaulted account and is
capped by pool liquidity.
