# apps/app/hooks

React hooks that fetch or derive state for screens. Each returns plain values plus `loading` and
`error`; screens never call wagmi or `fetch` directly.

Product-agnostic and kept: `useWallet` (the only answer to who is connected), `useToast`, `useNav`,
`usePanel` (desktop drawers), `useIsDesktop`, `useRedirectDesktopToHome`.

Being replaced for Matocard (see `../CLAUDE.md`):

- `useCreditLine` is replaced by **`useCredit`** (done): one multicall on `MatoCreditLine` (Monad
  testnet) for verified, score, ratio, limit, available, debt, due date, cycles, collateral (with
  card holds) and the AUSD and MON balances, plus the user's own writes `draw(amount, to)`,
  `repay` (AUSD permit, one transaction), `repayFromCollateral` and `withdrawCollateral`. Each write
  switches to Monad, sends the published gas limit and resolves only after reading the change back.
  Checked live against the demo account: score 55, limit 134.529147 on 150 AUSD.
- `useCardAccount`, `useCardSecrets`, `useKycStart` move to the backend's signed routes (`/me`,
  `/kyc/session`).
- `useTransactions`, `useCreditHistory`, `useLimitHistory` move to the indexer's `Activity`,
  `Cycle` and `ScoreChange`.
- `useRemoteCollateral`, `useRemoteWithdrawals`, `useCollateral`, `useWalletAssets`, `usePrices`
  are the earlier app's and are deleted, not ported.

- Read the chain for anything the user is about to act on, the indexer only for history: the
  indexer can lag and limits move with vault yield without an event.
- Poll with `lib/matocard/polling.ts` (`pollInterval`): fast while something is in flight, slow
  otherwise.
