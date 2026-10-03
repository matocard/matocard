# Matocard

A card whose limit grows with how you pay, and whose credit history crosses borders with you.
Built for Monad Metropolis, Track 02 (Consumer Products & Payments). Deadline **14 Oct 2026,
10:59 WIB**. `PLAN.md` is the source of truth for scope, the demo script (§3) and the schedule
(§12); read it before proposing anything.

Persona: Siti, an Indonesian worker in Kuala Lumpur with no credit history in either country. She
tops up in ringgit, the money becomes collateral in a yield vault, she draws against it (for example
straight to her mother in Yogyakarta), and every cycle repaid on time raises her score and lowers
the collateral she needs, from 150% down to 80%.

## Writing rules

**Never use an em dash.** Not in UI copy, code comments, commit messages, docs or replies. Use a
comma, a colon, a full stop or parentheses, or recast the sentence.

**Axel picks the words.** Any user-visible wording (a label, a heading, a caption) is his call.
Bring two or three concrete options with a recommendation, then wait.

**The blockchain is invisible** (PLAN §3). Judges mark down anything that reveals crypto. Banned on
user-facing screens: wallet, gas, chain, token, onchain transaction, seed, and AUSD except in a
detail or breakdown row. Headline amounts are local currency with "≈"; debt is shown in its locked
dollar value. Never "interest" or "dividend": say "interest-free" and "collateral yield". Always show
why the limit is what it is (collateral, score, ratio). The Agora bounty needs an AUSD balance on
screen, on a detail row such as `Balance 50.00 USD · AUSD`.

## Who owns what

| | Owner | |
| --- | --- | --- |
| `contracts/`, `apps/indexer` | Fajar (`FjrREPO`) | Foundry, Envio |
| `apps/backend` | Kiel (Yeheskiel Yunus Tame) | api, kyc, payments, relayer in one Bun process |
| `apps/app`, `apps/landing` | Axel (`Lexirieru`) | Next 16 |

A gap in someone else's area is raised with them, not patched from yours.

## The shape of the system

```
apps/app (Next PWA) ──HTTPS──▶ apps/backend (Bun + Postgres, VPS)
     │                           │ relayer: depositFor, repayFor, cancelPending,
     │ user txs: draw,           │ setVerified, ERC-3009 sends, MON drip
     │ repayWithPermit, ...      ▼
     └──────────────────▶ MatoCreditLine on Monad testnet (10143) ──▶ Envio indexer (GraphQL)
```

- **Chain** is the truth: limit, available, score, collateral are read live (`limitOf` moves with
  vault yield without an event).
- **Indexer** is history only: activity feed, cycles and score history for `/verify`, daily
  reconciliation. It indexes credit-line events only, so a plain AUSD transfer to someone (Mom
  receiving) does not appear there.
- **Backend** composes one answer per screen (`/me`, `/me/activity`, `/verify/:wallet`) and runs
  every fiat leg. Signed-in routes take `Authorization: Matocard <wallet>.<until>.<signature>`; see
  `apps/backend/CLAUDE.md`.

Live addresses: `packages/contracts/src/addresses.ts` (the proxy is
`0x4D6279c3DD0369e788C33b3aE1297D4E9abbd01a`, AUSD `0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC`).
Indexer GraphQL: `apps/indexer/README.md` holds the current URL; it changes on every redeploy.

## Rules that hold everywhere

- **Money is bigint in the smallest unit**, sent as decimal strings. AUSD has 6 decimals, MYR sen,
  IDR rupiah. Use `@matocard/core` (`parseAmount`, `formatAmount`, `baseToQuote`), never floats.
- **Monad charges the gas limit, not gas used.** Send `gasLimits` from `@matocard/contracts`
  instead of estimating. There is no global mempool: back-to-back sends from one key get dropped.
- **A receipt is not success.** Read back the state the transaction was meant to change.
- **An unread figure is a dash, never a zero.** `0` is a claim about someone's money.
- **`minCycleDuration` is 60 s on testnet.** A draw repaid faster settles the debt and scores
  nothing, silently. Only repaying to zero closes a cycle.

## Open decisions

- **Account layer.** The app runs Reown AppKit + wagmi + viem (Axel's call, 3 Oct). PLAN D3 and the
  Agora bounty want Mera passkey onboarding. Mera yields a plain viem `LocalAccount`
  (`@category-labs/mera/viem`), so it can sit behind wagmi later as a connector. Decide before the
  user tests on 9 Oct, and fix the app's final domain first: a passkey is bound to its domain.
- **CORS.** The backend sends no CORS headers and answers no `OPTIONS`, so a browser on another
  origin cannot call it with an `Authorization` header. Either a Next rewrite proxies it, or Kiel
  adds CORS.

## Workspace

Bun 1.3 workspaces + Turborepo. **Biome** lints the whole repo from the root; the husky pre-commit
hook runs `biome check --staged --write`, so only staged files are touched.

```sh
bun install
bun run lint          # biome
bun run typecheck     # turbo, every workspace
bun run test          # turbo; the backend's tests need DATABASE_URL, anvil and forge
```

Commits are small and conventional, scoped by area: `feat(app): ...`, `fix(indexer): ...`,
`docs(contracts): ...`. One topic per branch and PR.

## Per-directory notes

| | |
| --- | --- |
| `apps/app/CLAUDE.md` | the cardholder app, and how much of it is still from an earlier project |
| `apps/landing/CLAUDE.md` | the marketing page and its scroll-locked hero |
| `apps/backend/CLAUDE.md` | routes, auth, and how money moves |
| `apps/indexer/CLAUDE.md` | Envio deployments and what is (not) indexed |
| `contracts/CLAUDE.md` | the modular UUPS line, scoring, and storage rules |
| `packages/contracts/CLAUDE.md` | ABIs, addresses, gas limits |
| `packages/core/CLAUDE.md` | money helpers |
| `packages/tsconfig/CLAUDE.md` | shared TypeScript config |
