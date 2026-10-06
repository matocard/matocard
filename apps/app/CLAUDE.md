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

Copied on 3 Oct 2026 from the frontend owner's earlier card app and rebuilt for Matocard (4 Oct):
the shell and the UI kit carried over, every screen and its data layer are Matocard's own.

| Route | What it does | Data |
| --- | --- | --- |
| `/` | Onboarding tour, then connect | none |
| `/home` | Available in local currency (AUSD on the detail row), sign-in, country, KYC, why the limit, owed, balance, recent activity, the card | `useCredit`, `useMe`, `useFx`, `useMyActivity` |
| `/topup` | Ringgit (FPX, DuitNow, card) or rupiah (bank, QRIS, card) by country, through Xendit | `/quote`, `/topups` |
| `/send` | To family, typed in rupiah: from the card (`draw`) or the balance (ERC-3009 via `/sends`) | `useCredit`, `signTransfer` |
| `/settle` | In local currency, from the balance (permit) or from collateral | `/settlements`, `useCredit` |
| `/cashout` | Balance to an Indonesian bank in rupiah, typed in USD or rupiah | `signTransfer`, `/cashouts` |
| `/transactions` | History, by card and top-ups | `useMyActivity` |
| `/credit` | Your record and the link to share it | `useVerifyRecord` |
| `/verify/[id]` | Public record, no sign-in, nothing personal | `/verify/:wallet` |
| `/account` | Account and log out | `useWallet` |

Local currency comes from `user.country` (`lib/matocard/local.ts`): `MY` pays in ringgit through
the Malaysian Xendit account, everyone else in rupiah; cash-outs are always rupiah.

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

**Monad only.** It is the one network and AppKit's default, and `selectMonad()` switches to it
again after connect through `switchChain`, which adds the chain to a wallet that lacks it.

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

**`localStorage` keys live in `lib/storage.ts`**, prefixed `matocard.`; the backend session is one.

**KYC opens Didit in an iframe** (`components/card/KycSheet.tsx`) with `allow="camera; microphone"`.
The verdict never comes through the iframe; the sheet polls the backend.

## Brand

`public/brand/`: `matocard-logo.png` (dark mark, transparent) and `matocard-logo-white.png` (white,
for dark surfaces such as the card face). Every Matocard logo in the app is one of these two, never
a mark on a white square, the same as the landing page (Axel, 4 Oct); the JPEG source lives only in
`apps/landing/public`. The favicon is the transparent pair, picked by `prefers-color-scheme` in
`app/layout.tsx`; there is deliberately no `app/icon.png`. Monad, MON and AUSD marks are in `public/chains/monad.svg` and `public/tokens/`.

## Tests

`bun run test` (vitest), `bun run test:live` (against the live backend and chain), `bun run e2e`
(Playwright; stop `bun run dev` first). `e2e/CLAUDE.md` has the details.

## Lint

The repo root lints this app with **Biome** (`bun run lint` at the root, and the pre-commit hook).
The `lint` script in this package runs ESLint and is left over; Biome is what CI runs.

## Per-folder notes

`app/`, `components/`, `hooks/`, `lib/`, `providers/`, `public/` and `e2e/` each have a
`CLAUDE.md` with what is specific to them.
