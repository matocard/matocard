# apps/app/app

App Router routes. Every route renders inside `layout.tsx`: `Web3Provider` (wagmi + React Query),
`WalletProvider` (who is connected), `ToastProvider`. The route table is in `../CLAUDE.md`.

| Group | What it is |
| --- | --- |
| `page.tsx` | Onboarding tour, then connect. Figures are PLAN §3's demo (Rp 2.4m tops up 150 AUSD, limit 100, then 134.52 at score 55) |
| `(app)/` | Tabbed screens behind `AuthGate`: `home`, `credit`, `account` |
| `(flow)/` | Full-screen tasks behind `AuthGate`: `send`, `topup`, `settle`, `cashout`, `transactions`. Each must be listed in `lib/matocard/desktopRoutes.ts`; the test there reads this folder |
| `verify/[id]` | The public record: no `AuthGate`, no sign-in |
| `kyc/return/` | A page to land on after Didit |

- After Didit, the backend sends users to `/?verificationSessionId=…`; `/` forwards a stored session
  to `/home`, which polls `GET /me` while KYC is pending. Trust `verified` (the contract), not
  Didit's `status`.
- Read the clock in an effect, never during render: a relative time baked into server HTML breaks
  hydration.
- `layout.tsx` reads cookies so wagmi can render the connected state on the server; that makes every
  route dynamic, on purpose.
