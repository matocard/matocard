@AGENTS.md

# @matocard/app

The cardholder app (PLAN §8). Next 16 (App Router, Turbopack) + React 19 + Tailwind 4 (`@theme` in
`app/globals.css`, no config file). Wallet layer: Reown AppKit + wagmi + viem, on **Monad testnet**
(chain `10143`).

```bash
bun run dev -- --port 3001   # the landing page defaults to :3000
bun run test                 # vitest
bun run typecheck
```

## Where this app stands

Copied on 3 Oct 2026 from the frontend owner's earlier card app, which locked collateral on one
chain and proved it on another. The shell and the UI kit carry over; **the screens are being
rebuilt for Matocard's flows** (Axel's decision, 4 Oct): top up by card or bank, send to family,
receive and cash out, settle, history, the public `/verify` page.

The order of work, so the app keeps building and running at every commit:

1. Monad testnet is the default network (done). The earlier networks stay in `lib/matocard/wagmi.ts`
   only until nothing reads them.
2. Contracts from `@matocard/contracts` (addresses, ABIs, gas limits) and a credit-line hook on
   `MatoCreditLine`.
3. The backend client (`apps/backend`, see its `CLAUDE.md`): signed session, `/me`, `/me/activity`,
   `/quote`, `/kyc/session`, `/topups`, `/settlements`, `/sends`, `/cashouts`, `/verify/:wallet`.
4. Indexer queries for `Activity`, `Cycle` and `ScoreChange` (`apps/indexer/schema.graphql`).
5. Screens, one at a time, each replacing its old counterpart.
6. Delete what is left of the earlier flows: `hooks/useRemote*`, `useCollateral`,
   `useWalletAssets`, `usePrices`, `components/deposit`, `components/withdraw`,
   `components/account/FaucetSection.tsx`, `lib/matocard/{vaa,eip681,pendingRelease,faucets,oracle,prices}.ts`,
   `app/api/prices`, and the extra networks.

Until step 6 lands, anything in that list is not Matocard and should not be extended.

## Rules for every screen

From PLAN §3 and the root `CLAUDE.md`:

- No wallet, gas, chain, token, seed or onchain words on user-facing screens. AUSD appears only on a
  detail or breakdown row (the Agora bounty needs it there).
- Headline amounts in local currency with "≈"; debt in its locked dollar value.
- Always show why the limit is what it is: collateral, score, ratio.
- "Interest-free" and "collateral yield", never "interest" or "dividend".
- Money is bigint in the smallest unit (AUSD has 6 decimals). Format with `@matocard/core`.
- Send the published gas limits from `@matocard/contracts`: Monad charges the limit.
- Wording on screens is Axel's call; bring options.

## The wallet layer

`lib/wallet.ts` is the seam: `connect`, `getAddress`, `getWalletId`, `disconnect`. Swapping the
account layer (for example Mera passkeys behind a wagmi connector) should touch this file and
`lib/wallet-reown.ts`, not the screens.

**Everything from `@reown/*` and `wagmi/actions` is imported dynamically.** `WalletProvider` is a
client component that Next still evaluates on the server; a static import drags the connector
stack into the SSR graph.

**`WalletProvider` (`useWallet()`) is the single answer to "who is connected".** Reading
`useAccount()` from wagmi instead makes one screen disagree with the rest. Never use
`config.connectors[0]`: that is the first registered connector, not the connected one.

**Monad first.** `networks[0]` is AppKit's default, and `selectMonad()` switches to it again after
connect through `switchChain`, which adds the chain to a wallet that lacks it.

**Do not add `@reown/appkit-adapter-ethers`.** It and the wagmi adapter both register `eip155`.

**`@x402/core`, `@x402/evm`, `@x402/svm` are dependencies because nothing imports them.**
`@wagmi/connectors` reaches `@coinbase/cdp-sdk`, which imports all three; one unresolved fails every
route with a 500. `next.config.ts` explains the rest.

`NEXT_PUBLIC_E2E=1` swaps the wallet for a stub that signs without a prompt (`lib/wallet-e2e.ts`).
Correct under Playwright, catastrophic anywhere else; it is deliberately absent from `.env.example`.

## Habits worth keeping

**A receipt is not a success.** `lib/matocard/tx.ts` (`awaitSuccess`) is the one definition: it
returns nothing and takes an optional read-back of the state the transaction was meant to change.
wagmi's `receipt.isSuccess` means the query resolved, not that the transaction did.

**A failure before the wallet is asked is still a failure.** A chain switch, a read, a receipt
check: surface each one.

**An unread figure is a dash, never a zero.** `StatStrip` and `CardHero` print `—` (a typographic
glyph, the one allowed use of that character) while a figure is loading.

**Read the clock after mount, never during render.**

**`localStorage` keys live in `lib/storage.ts`**, prefixed `matocard.`.

**KYC opens Didit in an iframe** (`components/card/KycSheet.tsx`) with `allow="camera; microphone"`.
The verdict never comes through the iframe; the sheet polls the backend.

## Brand

`public/brand/`: `matocard-logo.png` (dark mark, transparent), `matocard-logo-white.png` (white, for
dark surfaces such as the card face), `matocard-logo.jpeg` (the source, a dark mark on a white
square, kept for the onboarding's app-icon tile and the wallet modal). The favicon is the
transparent pair, picked by `prefers-color-scheme` in `app/layout.tsx`; there is deliberately no
`app/icon.png`. Monad, MON and AUSD marks are in `public/chains/monad.svg` and `public/tokens/`.

## Lint

The repo root lints this app with **Biome** (`bun run lint` at the root, and the pre-commit hook).
The `lint` script in this package runs ESLint and is left over; Biome is what CI runs.

## Per-folder notes

`app/`, `components/`, `hooks/`, `lib/`, `providers/`, `public/`, `e2e/` and `docs/` each have a
`CLAUDE.md` with what is specific to them.
