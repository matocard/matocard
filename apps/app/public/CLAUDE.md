# apps/app/public

Served as is. Check a file's real type with `file` before adding it: Next sets `Content-Type` from
the extension.

- `brand/`: Matocard's transparent logo, dark and white (see `../CLAUDE.md`, Brand).
- `tokens/`: `ausd.png` (Agora's AUSD mark, 256 px), `mon.svg` (Monad's MON, from
  monad.xyz/brand-page-assets) and `idr.svg` (a round Indonesian flag for the rupiah, drawn here)
  are Matocard's. The other token files serve the earlier screens and
  go with them; `components/ui/CoinBadge.tsx` maps symbols to files.
- `chains/`: `monad.svg` (Monad's logomark). The rest go with the earlier screens.
- `wallets/`: icons on the connect screen.
- `fonts/`: Switzer, loaded by `lib/fonts.ts`.
