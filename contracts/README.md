# Matocard contracts

An interest-free credit line in AUSD. Borrowers post collateral that earns yield; their limit rises with every cycle they repay on time. Foundry, Solidity 0.8.30, OpenZeppelin 5.4.

## Deployments

Monad testnet (chain `10143`). All contracts verified on [MonadVision](https://testnet.monadvision.com).

| Contract | Address |
|---|---|
| MatoCreditLine (proxy) | [`0x39BED14767138AbA87d1F07b64088e1042239C59`](https://testnet.monadvision.com/address/0x39BED14767138AbA87d1F07b64088e1042239C59) |
| MatoCreditLine (implementation) | [`0x578b2807ea81C429505F1be4743Aec422758A461`](https://testnet.monadvision.com/address/0x578b2807ea81C429505F1be4743Aec422758A461) |
| MockEarnAUSD (yield vault) | [`0xe6a522DF58cBea4559521Eb6092962Cf87aaEBee`](https://testnet.monadvision.com/address/0xe6a522DF58cBea4559521Eb6092962Cf87aaEBee) |
| TestAUSD | [`0x0c2470065cAD1CdE95062E1203B631C3a06B4f79`](https://testnet.monadvision.com/address/0x0c2470065cAD1CdE95062E1203B631C3a06B4f79) |

Always talk to the **proxy**. It has been upgraded once, from [`0x6C0F…3891`](https://testnet.monadvision.com/address/0x6C0FD5a46C6208f0b7eCf03b754571465fA03891), to fix each cycle's rules at its first draw; every balance and score carried over. The pool is seeded with 100,000 TestAUSD. TestAUSD and MockEarnAUSD stand in for AUSD and earnAUSD, which have no testnet faucet.

A full cycle against these addresses, with every transaction: [docs/e2e-testnet-run.md](../docs/e2e-testnet-run.md).

## Architecture

One UUPS proxy. The implementation is composed of modules, each storing its state in its own [ERC-7201](https://eips.ethereum.org/EIPS/eip-7201) namespace so a module can change in an upgrade without moving another's storage.

| Module | Responsibility |
|---|---|
| `Governed` | Roles, pause, parameters, upgrade authorisation. Two-step admin handover with a one-day delay |
| `PoolModule` | ERC4626 pool over AUSD for lenders |
| `IdentityModule` | One verified identity per wallet, in both directions |
| `CollateralModule` | Collateral as yield-vault shares, card-payment hold, chargeback reversal, yield fee |
| `CreditModule` | Draw, repay, default, score and limit |
| `CreditScoring` | Pure library: score, collateral ratio, limit |

Events and errors for the indexer and app are in [`src/interfaces/IMatoCreditLine.sol`](src/interfaces/IMatoCreditLine.sol).

## How a limit is computed

```
score = Record (40) + Consistency (20) + Volume (40)
ratio = 150% − 70% × score / 100          150% at score 0, 80% at score 100
limit = collateral value (net of yield fee) / ratio
```

| Component | Formula |
|---|---|
| Record | `40 × repaid × min(cycles, 3) / (cycles × 3)` |
| Consistency | `20 × min(repaid, 10) / 10` |
| Volume | `40 × min(Σ utilisation bps, 100000) / 100000` |

A cycle counts only if it is repaid to zero by its due date, stays open at least `minCycleDuration`, and uses at least 10% of the limit. Anything else settles the debt and adds nothing. A default counts as a cycle with no repayment.

| 150 AUSD collateral | Score | Limit |
|---|---|---|
| New account | 0 | 100.00 |
| One cycle at 50% | 17 | 108.61 |
| Three cycles at 80% | 55 | 134.52 |

## Roles

| Role | Can | Cannot |
|---|---|---|
| Admin | Upgrade, pause, set parameters, grant roles | Move funds directly. An upgrade can change any rule, so the admin is trusted on testnet; production puts it behind a multisig and timelock |
| `KYC_ROLE` | Bind an identity hash to a wallet | Rebind or unbind one |
| `RELAYER_ROLE` | Credit fiat top-ups, reverse a top-up still in its hold | Touch collateral past its hold |

`repay` is never paused. What each role and the admin can change, and the risks lenders and borrowers carry: [TRUST.md](TRUST.md).

## Parameters

| | Testnet | Production |
|---|---|---|
| `term` | 30 days | 30 days |
| `grace` | 3 days | 3 days |
| `minCycleDuration` | 60 s | 7 days |
| `cardHold` | 60 s | 7 days |
| `minUtilizationBps` | 1000 | 1000 |
| `yieldFeeBps` | 2000 | 2000 |

## Development

```sh
forge install foundry-rs/forge-std --no-git
forge install OpenZeppelin/openzeppelin-contracts@v5.4.0 --no-git
forge install OpenZeppelin/openzeppelin-contracts-upgradeable@v5.4.0 --no-git

forge build
forge test
forge fmt --check
```

CI runs Foundry 1.8.3 and treats lint warnings as failures to fix.

## Deploy

```sh
cp .env.example .env    # WALLET_PK, optional AUSD_ADDRESS
source .env
forge script script/DeployMatoCreditLine.s.sol --rpc-url $MONAD_RPC_URL --broadcast --slow
```

Without `AUSD_ADDRESS` the script deploys TestAUSD and seeds the pool. `--slow` sends one transaction at a time; Monad has no global mempool, so back-to-back sends from one key can be dropped.

Verify on MonadVision through Sourcify:

```sh
forge verify-contract <address> <path>:<Contract> --chain 10143 \
  --verifier sourcify --verifier-url https://sourcify-api-monad.blockvision.org
```

Upgrade (admin only):

```sh
PROXY=0x39BED14767138AbA87d1F07b64088e1042239C59 \
  forge script script/UpgradeMatoCreditLine.s.sol --rpc-url $MONAD_RPC_URL --broadcast --slow
```

New state goes at the end of a module's struct or namespace, never between existing fields.
