# End-to-end run on Monad testnet

> Three deployments so far. The first (proxy `0x39BE…9C59`) and second (`0x142A…394C`) ran on TestAUSD and are retired. The current one runs on Agora's real AUSD; its runs are in the last section.

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

## Second deployment (29 Sep 2026, retired)

Redeployed so the stand-in token has AUSD's `permit` and ERC-3009. State read back after deploy: implementation in the ERC1967 slot, asset and vault asset equal, admin and roles, testnet params, 100,000 in the pool, and the token's EIP-712 domain. All four contracts verified on Sourcify.

| | |
|---|---|
| MatoCreditLine (proxy) | [`0x142A155055b8aE415118f605e2c85B71c029394C`](https://testnet.monadvision.com/address/0x142A155055b8aE415118f605e2c85B71c029394C), block 66642498 |
| TestAUSD | [`0x642dA38444cd6C51a126549ba72b7D3d51E37C9a`](https://testnet.monadvision.com/address/0x642dA38444cd6C51a126549ba72b7D3d51E37C9a) |
| MockEarnAUSD | [`0xA5238544faa35C9768bA9984aEd018A96b4A72Ba`](https://testnet.monadvision.com/address/0xA5238544faa35C9768bA9984aEd018A96b4A72Ba) |

**Demo accounts**, recreated by `demo-accounts.sh` with the same keys: Siti at score 18 → 36 → 55, limit 134.529147; Mom holds 263.490089 AUSD.

| Cycle | Draw | Repay | Score after |
|---|---|---|---|
| 1 | [`0xe71a…468d`](https://testnet.monadvision.com/tx/0xe71a1a5e0dd30989a90cdff138c68f3fccdff3f1d4414c8e29dd7f8dafe0468d) | [`0xe676…82f9`](https://testnet.monadvision.com/tx/0xe676e4bff3cf17f62b4fbd8d454fb60c07e1bb8ccca9de74abaf5370494682f9) | 18 |
| 2 | [`0xc7f7…b3a1`](https://testnet.monadvision.com/tx/0xc7f7cbc2c036f6acc2127ed88211c85dd8d8e33718a2693d16d23bd5872cb3a1) | [`0x102b…57c2`](https://testnet.monadvision.com/tx/0x102bbecde4e394404ba4fffd269175ad569440d00b95886c1b111286083957c2) | 36 |
| 3 | [`0xe92a…380d`](https://testnet.monadvision.com/tx/0xe92a5d87b3a6be4a0dd3d6fef566eb77033c92e1818048b68c1aa8653d9b380d) | [`0x267f…9b8b`](https://testnet.monadvision.com/tx/0x267f32826882c96f3c4fb80f21a31b7c437775df6faf90022a04cf6f386f9b8b) | 55 |

**Gasless send (ERC-3009).** Mom signed a `TransferWithAuthorization` for 10 AUSD; the relayer submitted it ([`0x2bba…fbee8`](https://testnet.monadvision.com/tx/0x2bba0739ed68a832c2a86f34d68594dcf33b6f622bffc110f3c072502b0fbee8)). The recipient's balance went 0 → 10, the nonce reads as used, and Mom's MON did not move: she sent no transaction.

**One-transaction repayment (`repayWithPermit`).** A borrower drew 20 and repaid with a signed permit ([`0x5d5e…0c53`](https://testnet.monadvision.com/tx/0x5d5e82506834cfa6bca887b5108961f4131205f3d6cf6b87653be27678f10c53)): balance owed 0, allowance used up exactly, permit nonce 0 → 1.

## Current deployment: real AUSD (30 Sep 2026)

Agora refilled its testnet faucet (`0xd236…e6C`) and confirmed that Monad testnet AUSD is enough for the bounty. The deployer collected 100,000 AUSD from it and deployed with `AUSD_ADDRESS` set; 90,000 went into the pool. State read back: implementation slot, asset and vault asset both AUSD, admin and roles, params, 90,000 idle and in the contract. Proxy, implementation and vault verified on Sourcify.

| | |
|---|---|
| MatoCreditLine (proxy) | [`0x4D6279c3DD0369e788C33b3aE1297D4E9abbd01a`](https://testnet.monadvision.com/address/0x4D6279c3DD0369e788C33b3aE1297D4E9abbd01a), block 66922881 |
| AUSD (Agora) | [`0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC`](https://testnet.monadvision.com/address/0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC) |
| MockEarnAUSD | [`0xF93Dc9038F4209675C3ab7909d0FEE4738Dd7C08`](https://testnet.monadvision.com/address/0xF93Dc9038F4209675C3ab7909d0FEE4738Dd7C08) |

**Demo accounts**, funded by transfer from the treasury since real AUSD cannot be minted: Siti 18 → 36 → 55, limit 134.529147; Mom holds 263.490089 AUSD.

| Cycle | Draw | Repay | Score after |
|---|---|---|---|
| 1 | [`0x864a…abd8`](https://testnet.monadvision.com/tx/0x864a02af32f448b515d8e8719d2dffdbd65d657cff2dd1289ee82d0b55aeabd8) | [`0x503c…ed96`](https://testnet.monadvision.com/tx/0x503c2d23ffa8d79d9db7a3a042b5155f14d14d5155e4979ab36581357c75ed96) | 18 |
| 2 | [`0x64f8…95fb`](https://testnet.monadvision.com/tx/0x64f8a31444125afca3357f350f00998c9d1e97653be2164d3b54f95e2bd595fb) | [`0x8595…73c1`](https://testnet.monadvision.com/tx/0x8595b4a615742e00a0e20d1faf3f7f88fc943094da873ccebd11651dbda273c1) | 36 |
| 3 | [`0x180c…b39e`](https://testnet.monadvision.com/tx/0x180cb7e81ae54c0debbbb3ee676cccdbc96138125a9320c516aed03d9c83b39e) | [`0x5052…0612`](https://testnet.monadvision.com/tx/0x5052a03ed7e727013354fb9455352425ce67bdb58dfb000817293effb4af0612) | 55 |

**Gasless send on AUSD (ERC-3009).** Mom signed a `TransferWithAuthorization` under AUSD's EIP-712 domain, which is named `Agora Dollar` (not `AUSD`); the relayer submitted it ([`0x203c…209d`](https://testnet.monadvision.com/tx/0x203c0de041f503dcc47870f692cbb13c36e4c7e0b88e67c638cb7c48167d209d)). Recipient 0 → 10 AUSD, nonce used.

**Card top-up, then a one-transaction repayment.** A card top-up of 150 ([`0x4100…738c`](https://testnet.monadvision.com/tx/0x41001bcd6b7e88537b27271db068001d69bc5596d55ef2e2c70262a00f9b738c)), a draw of 20 once the hold ended ([`0xdb72…179a`](https://testnet.monadvision.com/tx/0xdb72cb0e62219efcaff5c269e69bd449b0dd17bba1e14021f71a3e2b0179179a)), and `repayWithPermit` with an AUSD permit ([`0xeffa…d8df`](https://testnet.monadvision.com/tx/0xeffa36015c815515fb2e0c1ba766f44a8b4cd3989ecf701df3eefc52fce4d8df)): owed 0, allowance used exactly, permit nonce 0 → 1.

**Gas on real AUSD** is higher than on TestAUSD. Its `approve` alone is 71,075, above the 70,000 limit published before; `draw` settling a hold is 356,244. Every limit in `@matocard/contracts` was re-measured here and raised where needed.
