# @matocard/core

Shared money helpers (`src/money.ts`). Every amount is a bigint in its currency's smallest unit:
`DECIMALS = { AUSD: 6, USD: 2, MYR: 2, IDR: 0 }`. No floats anywhere money is counted.

- `parseAmount("12.5", "AUSD")` refuses more decimals than the currency has; it never rounds.
- `formatAmount` keeps at least two decimals and drops trailing zeros past them.
- `baseToQuote` / `quoteToBase` convert at a decimal-string rate (`"4.4567"` MYR per USD). Round
  `"down"` for what the user receives, `"up"` for what the user is charged. AUSD counts as USD.

The backend uses these for every quote; the app should use the same functions so a figure on screen
matches what the backend charges.
