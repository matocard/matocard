# apps/app/lib

Non-React code.

- `wallet.ts` is the seam screens use (`connect`, `connectPasskey`, `getAddress`, `getWalletId`,
  `disconnect`); `wallet-reown.ts` implements it on wagmi core actions, `wallet-e2e.ts` is the
  Playwright stub. `passkey.ts` is the Mera account (key in memory only), and
  `matocard/passkey-connector.ts` puts it behind wagmi.
  `wallet-error.ts` normalises wallet errors.
- `storage.ts`: every `localStorage` key, prefixed `matocard.` (Home's AUSD swap is `headlineUnit`).
- `utils.ts`, `ease.ts`, `fonts.ts`, `activity/map.ts`: formatting and presentation helpers.
- `matocard/`:
  - `monad.ts`: credit line, AUSD, ABIs and gas limits from `@matocard/contracts`, MonadVision
    links, and `ratioBps` / `limitFor` mirroring `CreditScoring` (tested against PLAN §6.3).
  - `backend.ts`: every backend route, the session message (byte for byte with the backend),
    `TREASURY`; amounts stay strings until `big()`.
  - `authorization.ts`: `signTransfer`, an ERC-3009 transfer under AUSD's own EIP-712 domain.
  - `money.ts`: AUSD, rupiah and ringgit on screen, converted with `@matocard/core`.
  - `local.ts`: the user's currency, Xendit pair, minimum and method names, from their country.
  - `wagmi.ts` (Monad only; `MONAD_RPC`), `appkit.ts` (the one AppKit instance), `tx.ts`
    (`awaitSuccess`: a receipt is not a success), `amount.ts`, `polling.ts`, `format.ts`,
    `holder.ts`, `activity.ts` (`ActivityItem`), `desktopRoutes.ts`.

Money: bigint in the smallest unit, never `Number()` on an amount; AUSD has 6 decimals, MYR is sen,
IDR is whole rupiah.
