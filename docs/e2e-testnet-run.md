# End-to-end run on Monad testnet

One full credit cycle against the deployed contracts, 28 September 2026. Every figure was read back from the chain after its transaction.

| | |
|---|---|
| Credit line (proxy) | [`0x39BED14767138AbA87d1F07b64088e1042239C59`](https://testnet.monadvision.com/address/0x39BED14767138AbA87d1F07b64088e1042239C59) |
| Borrower | [`0xfC5F512aB70F769035bFBCc6E2740158acB32554`](https://testnet.monadvision.com/address/0xfC5F512aB70F769035bFBCc6E2740158acB32554) |

| Step | Transaction | State read back |
|---|---|---|
| Verify identity | [`0x9f94…86ea`](https://testnet.monadvision.com/tx/0x9f940424cc8e385235215b4b5cdde49cdc49b08f907567cb008d1c12c99886ea) | `isVerified = true` |
| Card top-up, 150 AUSD | [`0x0396…ecd0`](https://testnet.monadvision.com/tx/0x03967559d33bbf3b8ccee33aa36fcbdb95084e7a678f72dfc9b7c2742113ecd0) | `limitOf = 0` during the 60 s hold |
| Hold ends | | `limitOf = 100.000000` |
| Draw 50 AUSD | [`0x2ded…98a4`](https://testnet.monadvision.com/tx/0x2deda169e42ff59ac2179e79a7d36d1899849d471bb82e4f15c7366d7f6698a4) | `drawn = 50`, `limitAtDraw = 100` |
| Repay 50 AUSD, 2 min later | [`0xef60…335e`](https://testnet.monadvision.com/tx/0xef60cf420877b4a84a7ca59c00c752f888a6d5872bb8fd59e8384e976125335e) | `cycleCount = 1`, `repayCount = 1`, `volumeBps = 5000` |
| Result | | `scoreOf = 17`, `limitOf = 108.616944` |

## The arithmetic

- Record: `40 × 1 × min(1,3) / (1 × 3) = 13`
- Consistency: `20 × 1 / 10 = 2`
- Volume: `40 × 5000 / 100000 = 2`
- Score `17`, ratio `15000 − 7000 × 17 / 100 = 13810` bps
- Limit `150 × 10000 / 13810 = 108.616944` AUSD

## Second cycle, and the indexer following along

Same borrower, a smaller draw. The hosted indexer showed the new score within ten seconds of the repayment.

| Step | Transaction | State read back |
|---|---|---|
| Draw 20 AUSD | [`0x444d…fa3e`](https://testnet.monadvision.com/tx/0x444d50966878c8277b55ff3d80e4b91914619995b50eca0a1b5e3264bc54fa3e) | `limitAtDraw = 108.616944` |
| Repay 20 AUSD, 1 min later | [`0x1852…ff02`](https://testnet.monadvision.com/tx/0x185261f0780d3bf0a61e67ea486dc039678ce76c165fbf64105253c1dc70ff02) | `scoreOf = 32`, `limitOf = 117.554858` |
| Indexer | | `Account.score = 32`, two `Qualified` cycles, `ScoreChange` 0 → 17 → 32 |

- Record: `40 × 2 × 2 / (2 × 3) = 26`
- Consistency: `20 × 2 / 10 = 4`
- Volume: `5000 + 1841 = 6841` bps, `40 × 6841 / 100000 = 2`
- Score `32`, ratio `12760` bps, limit `150 × 10000 / 12760 = 117.554858`

## Third cycle, after the first upgrade

The proxy was upgraded to an implementation that fixes each cycle's rules at its first draw. Before and after, read from the chain: implementation `0x6C0F…3891` → `0x578b…A461`; score 32, limit 117.554858, idle 100,000, totalAssets 100,000 and verification unchanged.

| Step | Transaction | State read back |
|---|---|---|
| Upgrade | `forge script script/UpgradeMatoCreditLine.s.sol` | new implementation in the ERC1967 slot, verified on Sourcify |
| Draw 25 AUSD | [`0xb9cb…c53f`](https://testnet.monadvision.com/tx/0xb9cb90354a0bfa5b4958b3562df4a1a9693dd5573271edca20e93557dee3c53f) | `defaultableAt = dueAt + 3 days`, `cycleMinDuration = 60`, `cycleMinUtilizationBps = 1000` |
| Repay 25 AUSD, 1 min later | [`0xb04a…f940`](https://testnet.monadvision.com/tx/0xb04a97047ab24d186539523a94beb7b4520bb8ced9adf29feedd1365b9fff940) | fields cleared, `scoreOf = 49`, `limitOf = 129.645635` |

- Record: `40 × 3 × 3 / (3 × 3) = 40`
- Consistency: `20 × 3 / 10 = 6`
- Volume: `6841 + 2126 = 8967` bps, `40 × 8967 / 100000 = 3`
- Score `49`, ratio `11570` bps, limit `150 × 10000 / 11570 = 129.645635`

## Demo accounts

Prepared with `contracts/script/demo-accounts.sh`, which checks every receipt and reads the state back after each step. Keys are in the deployer's `contracts/.env`, not in git.

| Account | Address | State |
|---|---|---|
| Siti, "3 months later" | [`0xc6E0De07b60a412c1bb990B77612754B9254DBDa`](https://testnet.monadvision.com/address/0xc6E0De07b60a412c1bb990B77612754B9254DBDa) | verified, 150 AUSD collateral, three qualifying cycles, score 55, limit 134.529147 |
| Mom | [`0xcC9c84AF69ff5aD646a6fdCD02D092ee69C6106b`](https://testnet.monadvision.com/address/0xcC9c84AF69ff5aD646a6fdCD02D092ee69C6106b) | verified, holds the 263.490089 AUSD Siti sent |

| Cycle | Draw (80% of limit) | Transactions | Score after |
|---|---|---|---|
| 1 | 80.000000 of 100.000000 | [draw](https://testnet.monadvision.com/tx/0x2eb3c161186fb317a0a6435650fd4bd698a35dda72e3a0c08f76d408743bdbae) · [repay](https://testnet.monadvision.com/tx/0x95e597fac08068b9d737efaeaa5af6dce60a4768df52bf026995a18bbf859abc) | 18 |
| 2 | 87.336244 of 109.170305 | [draw](https://testnet.monadvision.com/tx/0x101f2e542dcb13eb96ff4948c53da14cbb5141d7dfe92c43a57464c10fd6e770) · [repay](https://testnet.monadvision.com/tx/0xa2199f4fa12faabb513a6c8a1d6907d3445d704770b0d9adbbda25e57032c823) | 36 |
| 3 | 96.153845 of 120.192307 | [draw](https://testnet.monadvision.com/tx/0x6d89d90e076ea0b06db615e391857741ba3c28f9c33ddd4166e836417e6ddada) · [repay](https://testnet.monadvision.com/tx/0xa9b243e5faac94d35dc898aeb650a1d073bb41db0fdf27e1d8e1e71871f2e9eb) | 55 |

- Utilisation: 8000 + 8000 + 7999 = 23999 bps, Volume `40 × 23999 / 100000 = 9`
- Record 40, Consistency 6, Volume 9: score `55`, ratio `11150` bps, limit `150 × 10000 / 11150 = 134.529147`

These are plain keys, not passkeys. For the demo to show this history in the app, the app needs to sign in as this address, or run the same three cycles from the presenter's passkey account beforehand (about four minutes).
