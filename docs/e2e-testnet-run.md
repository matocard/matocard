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
