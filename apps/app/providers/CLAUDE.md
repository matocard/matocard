# apps/app/providers

Mounted once in `app/layout.tsx`, outermost first.

- `Web3Provider`: `WagmiProvider` with `cookieToInitialState` (so the server renders the connected
  state) and React Query. It warms `getAppKit()` in an effect so the modal exists before anyone
  taps Connect.
- `WalletProvider`: `useWallet()`, the single answer to who is connected. Restores a saved address
  on mount and re-verifies it against the live wallet before trusting it.
- `ToastProvider`: `useToast()`.

Each is a client component that Next still evaluates on the server, which is why nothing here
imports `@reown/*` or `wagmi/actions` statically.
