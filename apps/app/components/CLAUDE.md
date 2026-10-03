# apps/app/components

`ui/` is the kit every screen is built from (buttons, sheets, drawers, keypad, stat strip, toasts,
navigation). It is product-agnostic and stays through the rebuild; `ui/index.ts` is its barrel.
`CoinBadge` maps a symbol to a logo in `public/tokens/` and falls back to AUSD. `ChainBadge` and
`NetworkTabs` serve the earlier multi-chain screens and go with them.

Feature folders, by screen: `card/` (card face, card folder, KYC sheet), `home/`, `credit/` (score,
cycles, limit chart), `activity/` (history rows), `send/`, `spend/`, `deposit/`, `withdraw/`,
`account/`, `desktop/` (drawers and menus for wide screens), `motion/` (animation primitives kept
close to their upstream source).

`deposit/`, `withdraw/`, `account/FaucetSection.tsx`, `desktop/LockCollateralDrawer.tsx` and
`card/{ClaimableCollateral,CollateralList,IncomingDeposits}.tsx` are the earlier app's collateral
flows: do not extend them, they are replaced (see `../CLAUDE.md`).

- `.stagger > *` animates direct children to `opacity: 1`, and an animation beats a utility class: a
  `Toast` inside a `.stagger` wrapper is permanently visible and empty.
- `torph` needs `matchMedia` and `getAnimations`, which jsdom lacks; `vitest.setup.ts` shims both.
- `userEvent.setup()` installs its own clipboard stub, so plant a clipboard spy after it.
- Tests sit in `__tests__/` beside what they cover and mock hooks by module path.
