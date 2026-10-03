# apps/app/e2e

Two kinds of end-to-end test.

**Playwright** (`bun run e2e`): specs here, in a real browser, reading Monad testnet. They run with
`NEXT_PUBLIC_E2E=1`, which swaps the wallet layer for `lib/wallet-e2e.ts`, a stub that connects a
fixed, never-verified address without a prompt. Never set that variable anywhere else.

- `matocard-journey.spec.ts`: a new account's first minutes (no card yet, the step that opens one,
  top up asking for verification, nothing to settle, the onboarding's rupiah, AUSD and MON marks).
- `authgate-deep-link.spec.ts`, `desktop-overview.spec.ts`: the shell.
- `support/journey.ts`: shared steps (open, connect, land on Home).
- **Stop `bun run dev` first.** Next 16 refuses a second dev server in the same directory, and
  Playwright starts its own on :3100.
- The stub cannot sign, so nothing here signs in to the backend or sends a transaction.

**Live** (`bun run test:live`, `lib/matocard/__tests__/live.test.ts`): a throwaway key signs in to
`api.matocard.xyz` exactly as the app does and checks `/me`, a forged session, `/me/activity`, a
`USD/IDR` quote, a top-up refused before KYC, `/verify` against the chain and the app's limit maths,
and an ERC-3009 signature under AUSD's live domain. Off unless `LIVE=1`; each run creates a user.
