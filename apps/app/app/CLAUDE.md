# apps/app/app

App Router routes. Every route renders inside `layout.tsx`: `Web3Provider` (wagmi + React Query),
`WalletProvider` (who is connected), `ToastProvider`.

| Group | What it is |
| --- | --- |
| `page.tsx` | Onboarding tour, then connect. Figures are PLAN §3's demo (150 AUSD, limit 100, then 134.52 at score 55) |
| `(app)/` | Tabbed screens behind `AuthGate`: `home` (done: `useCredit` + `useMe` + `useFx` + `useMyActivity`, one layout at every width), `credit`, `account` |
| `(flow)/` | Full-screen tasks behind `AuthGate`; on desktop most redirect to a drawer (`lib/matocard/desktopRoutes.ts`) |
| `card/`, `kyc/return/` | Card details; where Didit sends the user back |

Being rebuilt for Matocard (see `../CLAUDE.md`): the `(flow)` routes for depositing, withdrawing and
paying belong to the earlier app and are replaced by top up, send, receive and cash out, and settle.
`api/prices` goes with them. Home already links to `/send`, `/topup` and `/settle`; `/topup` and
`/settle` are the next routes to build. A new public `verify/[id]` route needs no `AuthGate`.

- Read the clock in an effect, never during render: a relative time baked into server HTML breaks
  hydration.
- `layout.tsx` reads cookies so wagmi can render the connected state on the server; that makes every
  route dynamic, on purpose.
