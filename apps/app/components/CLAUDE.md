# apps/app/components

`ui/` is the kit every screen is built from (buttons, sheets, drawers, keypad, stat strip, toasts,
navigation); `ui/index.ts` is its barrel. `CoinBadge` maps AUSD, MON and IDR to `public/tokens/`.

By screen: `home/` (available, why the limit, owed, verification and country), `topup/`, `send/`
(with `QrScanButton`), `settle/`, `cashout/`, `verify/` (`RecordView`, shared by `/verify/[id]` and
the Credit tab), `activity/` (history rows: `ActivityRow` titles each kind), `card/` (card face,
KYC sheet), `account/`, `desktop/` (the account menu), `motion/` (animation primitives kept close
to their upstream source).

Screen wording is Axel's call. Words banned on user-facing screens: wallet, gas, chain, token,
onchain transaction, seed; AUSD only on a detail row.

- `.stagger > *` animates direct children to `opacity: 1`, and an animation beats a utility class: a
  `Toast` inside a `.stagger` wrapper is permanently visible and empty.
- `torph` needs `matchMedia` and `getAnimations`, which jsdom lacks; `vitest.setup.ts` shims both.
- `userEvent.setup()` installs its own clipboard stub, so plant a clipboard spy after it.
- Tests sit in `__tests__/` beside what they cover, mock hooks by module path, and call
  `vi.clearAllMocks()` in `beforeEach` when they count calls.
