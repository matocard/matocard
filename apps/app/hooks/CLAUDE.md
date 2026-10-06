# apps/app/hooks

React hooks that fetch or derive state for screens. Each returns plain values plus `loading` and
`error`; screens never call wagmi or `fetch` directly.

| Hook | Reads | Notes |
| --- | --- | --- |
| `useCredit` | `MatoCreditLine` on Monad (one multicall), AUSD and MON balances | Writes `draw`, `repay` (AUSD permit), `repayFromCollateral`, `withdrawCollateral`: switch to Monad, published gas limit, resolve only after the change reads back. Checked live: Siti reads score 55, limit 134.529147 |
| `useSession` | the signed backend session in `localStorage` | `signIn()` asks for one signature, kept six days |
| `useMe` | `GET /me` | KYC, country, card number; polls fast while KYC is pending |
| `useBackend` | | runs one signed call: signs in if needed, keeps the backend's own error |
| `useFx` | `POST /quote` | a display rate, shared and refreshed each minute; payments ask for their own |
| `useMyActivity` | `GET /me/activity` | indexed events plus payments in flight, as `ActivityItem` kinds |
| `useVerifyRecord` | `GET /verify/:wallet` | public record |
| `useWallet` | `WalletProvider` | the only answer to who is connected |

Also `useToast`, `useNav`, `usePanel`, `useIsDesktop`, `useRedirectDesktopToHome`.

- Read the chain for anything the user is about to act on (`useCredit`); `/me` and the indexer can
  lag, and limits move with vault yield without an event.
- Gate screens on `useCredit().verified` (the contract), never on `useMe().kyc` (#71): the demo
  accounts are verified onchain with `kyc: none`.
- Poll with `lib/matocard/polling.ts` (`pollInterval`): fast while something is in flight.
