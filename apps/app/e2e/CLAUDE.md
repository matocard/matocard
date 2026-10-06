# apps/app/e2e

Three kinds of end-to-end test, from cheapest to closest to the real thing.

**Playwright** (`bun run e2e`): specs here, in a real browser, reading Monad testnet and the live
backend. They run with `NEXT_PUBLIC_E2E=1`, which swaps the wallet layer for `lib/wallet-e2e.ts`, a
stub that connects a fixed, never-verified address without a prompt. Never set that variable
anywhere else.

- `matocard-journey.spec.ts`: a new account (no card yet, the step that opens one; top up, send,
  settle and cash out refusing politely), history, the Credit tab, the public `/verify` record
  (Siti, score 55), the Didit return, the onboarding's rupiah, AUSD and MON marks.
- `authgate-deep-link.spec.ts`, `desktop-overview.spec.ts`: the shell.
- **Stop `bun run dev` first.** Next 16 refuses a second dev server in the same directory, and
  Playwright starts its own on :3100. The stub cannot sign, so signed flows are covered below.

**Live** (`bun run test:live`, `lib/matocard/__tests__/live.test.ts`): a throwaway key signs in to
`api.matocard.xyz` as the app does: `/me`, a forged session refused, country and card number, KYC
(Didit URL, `pending`), `/me/activity`, rupiah and ringgit quotes, top-ups refused before
verification, `/verify` against the chain and the app's limit maths, and an ERC-3009 signature
under AUSD's live domain. Off unless `LIVE=1`; each run creates a backend user.

**Fork** (`bun run fork` in one terminal, `bun run test:fork` in another;
`hooks/__tests__/useCredit.fork.test.tsx`): the app's own `useCredit` and `signTransfer` in a real
`WagmiProvider` against an anvil fork of Monad testnet, so the real credit line, AUSD and vault.
The account is verified and funded by impersonating the backend's relayer; the test reads the
account (limit 100 on 150 AUSD), draws to Mom, repays with a permit, repays from collateral,
withdraws collateral, and has the relayer submit a signed transfer. The fork is snapshotted and
reverted, so runs repeat. Off unless `FORK_RPC` is set.

- jsdom swaps `AbortSignal`, which Node's `Request` and `fetch` refuse; the fork test strips the
  signal for its RPC calls.
- wagmi's mock connector needs `features: { reconnect: true }`, `storage: null` and connecting
  after the provider mounts, or the provider's hydration drops the connection.
