# apps/app/components

`ui/` is the kit every screen is built from (buttons, sheets, drawers, keypad, stat strip, toasts,
navigation, `InfoTip` for the ⓘ that explains a label); `ui/index.ts` is its barrel. `CoinBadge` maps
AUSD, MON and IDR to `public/tokens/`.

By screen: `home/` (available with its AUSD swap, owed, balance, verification and country;
`LimitBreakdown` is rendered by the Credit tab), `topup/`, `send/` (with `QrScanButton`),
`settle/`, `cashout/`, `verify/` (`RecordView`, shared by `/verify/[id]` and the Credit tab),
`activity/` (history rows: `ActivityRow` titles each kind), `card/` (card face, KYC sheet),
`account/` (`ReceiveSheet`: the account as a QR for Send's scanner), `desktop/` (the account menu),
`motion/` (animation primitives kept close to their upstream source).

Screen wording is Axel's call. Words banned on user-facing screens: wallet, gas, chain, token,
onchain transaction, seed; AUSD only on a detail row or behind Home's swap. The list in the app is
called History, never Activity.

- `.stagger > *` animates direct children to `opacity: 1`, and an animation beats a utility class: a
  `Toast` inside a `.stagger` wrapper is permanently visible and empty.
- `torph` needs `matchMedia` and `getAnimations`, which jsdom lacks; `vitest.setup.ts` shims both.
- `userEvent.setup()` installs its own clipboard stub, so plant a clipboard spy after it.
- Tests sit in `__tests__/` beside what they cover, mock hooks by module path, and call
  `vi.clearAllMocks()` in `beforeEach` when they count calls.
