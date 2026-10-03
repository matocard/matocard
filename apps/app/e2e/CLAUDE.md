# apps/app/e2e

Playwright specs (`bun run e2e`). They run with `NEXT_PUBLIC_E2E=1`, which swaps the wallet layer
for `lib/wallet-e2e.ts`, a stub that connects a fixed address without a prompt. Never set that
variable anywhere else.

`support/journey.ts` holds the shared steps (open, connect, land on Home). Specs cover deep links
through `AuthGate` and the desktop overview; extend them as the Matocard screens land.
