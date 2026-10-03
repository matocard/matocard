@AGENTS.md

# @matocard/app

The cardholder app. Next 16 (App Router, Turbopack) + React 19 + Tailwind 4 (`@theme` in
`app/globals.css`, no config file). Wallet layer: Reown AppKit + wagmi + viem.

```bash
bun run dev -- --port 3001   # landing also defaults to :3000
bun run test                 # vitest
bun run typecheck
```

## Where this app stands

It was copied whole from the frontend owner's earlier card project on 3 Oct 2026 and renamed. The
screens, components and test habits carry over; **the data layer does not fit Matocard yet**. Until
it is adapted, assume anything below talks to the old system:

| Still from the earlier project | Matocard needs instead |
| --- | --- |
| `lib/matocard/wagmi.ts`: Monad, Sepolia, Base, Arbitrum, Optimism, BSC, Fuji | Monad testnet (`10143`) only |
| `lib/matocard/contracts.ts`, `hooks/useCollateral.ts`, `useRemoteCollateral.ts`, `useRemoteWithdrawals.ts`, `components/deposit`, `components/withdraw`: lock collateral on one chain, prove it on another (Attestcoin, Wormhole) | fiat top-up through the backend (`POST /topups`, Xendit checkout); collateral is credited by the relayer |
| `lib/matocard/api.ts`: `GET /account/:wallet`, `/account/:wallet/card` | `GET /me`, `/me/activity`, `/quote`, `/verify/:wallet`, signed with `Authorization: Matocard ...` (see `apps/backend/CLAUDE.md`) |
| `lib/matocard/oracle.ts`, `prices.ts`, `app/api/prices`: ETH/MON prices | AUSD is the unit; FX comes from `POST /quote` (60 s lock) |
| `lib/matocard/graphql/`: the old indexer's schema | `Activity`, `Cycle`, `ScoreChange` from `apps/indexer/schema.graphql` |
| `lib/matocard/credit.ts`, `cycles.ts`: the old scoring | PLAN §6.3 (`contracts/src/libraries/CreditScoring.sol`) |
| `components/account/FaucetSection.tsx` | nothing; users never hold MON or buy tokens |
| `app/page.tsx` onboarding tour, `app/earn` | Axel's words, PLAN §3 flow |
| `.env.example` variables | to be rewritten with the data layer |

The logo is Matocard's own, in `public/brand/` (copies of the landing's): `matocard-logo.png` (dark
mark, transparent), `matocard-logo-white.png` (white mark, transparent, for dark surfaces such as
the card face) and `matocard-logo.jpeg` (the source, a dark mark on a white square, kept for the
onboarding's app-icon tile and the wallet modal). The favicon is the transparent pair, chosen by
`prefers-color-scheme` in `app/layout.tsx`; there is deliberately no `app/icon.png`, which Next
would add unconditionally.

Product rules that the adaptation must meet are in the root `CLAUDE.md` (banned words, local
currency headlines, always explain the limit) and PLAN §8 (the screen list).

## The wallet layer

`lib/wallet.ts` is the seam: `connect`, `getAddress`, `getWalletId`, `disconnect`. Swapping the
account layer (for example Mera passkeys behind a wagmi connector) should touch this file and
`lib/wallet-reown.ts`, not the screens.

**Everything from `@reown/*` and `wagmi/actions` is imported dynamically.** `WalletProvider` is a
client component that Next still evaluates on the server; a static import drags the connector
stack into the SSR graph.

**`WalletProvider` (`useWallet()`) is the single answer to "who is connected".** Reading
`useAccount()` from wagmi instead makes one screen disagree with the rest about whether anyone is
signed in. Never use `config.connectors[0]`: that is the first registered connector, not the
connected one.

**Do not add `@reown/appkit-adapter-ethers`.** It and the wagmi adapter both register `eip155`, and
the pair breaks connection state silently.

**`@x402/core`, `@x402/evm`, `@x402/svm` are dependencies because nothing imports them.**
`@wagmi/connectors` reaches `@coinbase/cdp-sdk`, which imports all three; one unresolved fails every
route with a 500. `next.config.ts` explains the rest.

`NEXT_PUBLIC_E2E=1` swaps the wallet for a stub that signs without a prompt (`lib/wallet-e2e.ts`).
Correct under Playwright, catastrophic anywhere else; it is deliberately absent from `.env.example`.

## Habits worth keeping through the adaptation

**A receipt is not a success.** `lib/matocard/tx.ts` (`awaitSuccess`) is the one definition: it
returns nothing, so there is no value to forget to check, and takes an optional read-back of the
state the transaction was meant to change. wagmi's `receipt.isSuccess` means the query resolved,
not that the transaction did.

**A failure before the wallet is asked is still a failure.** A chain switch, a read, a receipt
check: surface each one. A button that goes busy, comes back and says nothing reads as a click that
did not register.

**An unread figure is a dash, never a zero.** `StatStrip` and `CardHero` print `—` (a typographic
glyph, the one allowed use of that character) while a figure is loading.

**Read the clock after mount, never during render**, or the server's time is baked into the HTML.

**`localStorage` keys live in `lib/storage.ts`**, prefixed `matocard.`. `pendingRelease` is the only
record of a signed, unclaimed withdrawal; never rename a key without moving its value.

**KYC opens Didit in an iframe** (`components/card/KycSheet.tsx`) with `allow="camera; microphone"`.
Without it the page renders and then dies at the face check. The verdict never comes through the
iframe; the sheet polls the backend.

## Things that bite

- `.stagger > *` animates direct children to `opacity: 1`, and an animation beats a utility class: a
  `Toast` inside a `.stagger` wrapper is permanently visible and empty.
- `torph` needs `matchMedia` and `getAnimations`, which jsdom lacks; `vitest.setup.ts` shims both.
- `userEvent.setup()` installs its own clipboard stub, so plant a clipboard spy after it.
- Vitest does not read tsconfig paths; the `@/` alias is declared again in `vitest.config.mts`.
- `(flow)` routes redirect to a drawer on desktop, except the two addressed by id
  (`lib/matocard/desktopRoutes.ts`).

## Lint

The repo root lints this app with **Biome** (`bun run lint` at the root, and the pre-commit hook).
The `lint` script in this package runs ESLint and is left over; Biome is the one CI runs. Three
`biome-ignore` comments in `hooks/useCreditLine.ts` and `hooks/useRemoteCollateral.ts` name a rule
this repo does not enable and show as warnings; they go with those hooks.
