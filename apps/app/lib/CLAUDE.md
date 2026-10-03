# apps/app/lib

Non-React code.

- `wallet.ts` is the seam screens use (`connect`, `getAddress`, `getWalletId`, `disconnect`);
  `wallet-reown.ts` implements it on wagmi core actions, `wallet-e2e.ts` is the Playwright stub.
  `wallet-error.ts` normalises wallet errors.
- `storage.ts`: every `localStorage` key, prefixed `matocard.`.
- `utils.ts`, `ease.ts`, `fonts.ts`, `activity/map.ts`: formatting and presentation helpers.
- `matocard/`: the product's client layer.
  - Kept: `wagmi.ts` (networks, Monad first; `MONAD_RPC`), `appkit.ts` (the one AppKit instance),
    `tx.ts` (`awaitSuccess`: a receipt is not a success), `amount.ts`, `polling.ts`, `format.ts`,
    `holder.ts`, `activity.ts` (`ActivityItem`), `desktopRoutes.ts`, `graphql/client.ts`.
  - To rewrite: `contracts.ts` (move to `@matocard/contracts`), `api.ts` (the backend's signed
    routes), `graphql/queries.ts` and `types.ts` (the Matocard indexer), `credit.ts` and
    `cycles.ts` (check against `contracts/src/libraries/CreditScoring.sol`).
  - To delete: `vaa.ts`, `eip681.ts`, `pendingRelease.ts`, `faucets.ts`, `oracle.ts`, `prices.ts`
    (the earlier app's cross-chain and price code).

Money: bigint in the smallest unit, never `Number()` on an amount; AUSD has 6 decimals.
`@matocard/core` has `parseAmount`, `formatAmount` and the FX helpers the backend uses.
