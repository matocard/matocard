# Matocard

**A card whose limit grows with how you pay, and whose credit history crosses borders with you.**

Built on [Monad](https://monad.xyz) for Monad Metropolis, Track 02: Consumer Products & Payments.

[Website](https://matocard.xyz) · [Docs](https://docs.matocard.xyz) · [API](https://api.matocard.xyz/docs)

## The problem

Indonesian migrant workers in Malaysia have no credit history in either country. When cash runs short before payday, the options are predatory online lenders or loan sharks. And a record built with a Malaysian bank would not follow them home anyway.

## How it works

1. **Sign up and verify once.** A passkey creates the account; an ID check binds one person to one account.
2. **Top up.** Money paid in by card or bank transfer becomes collateral, held in a yield vault so it grows.
3. **Spend or send.** Draw against the limit, for example straight to family in Indonesia. Interest-free.
4. **Settle on time, get more.** Each cycle repaid on time raises the score, and the score lowers the collateral needed per unit of credit: from 150% for a new account down to 80%.

The record lives on Monad, so the person owns it, anyone can verify it, and it still counts after moving home. Every limit can be recomputed by hand from on-chain figures.

## Live on Monad testnet

| | |
|---|---|
| Credit line | [`0x4D6279c3DD0369e788C33b3aE1297D4E9abbd01a`](https://testnet.monadvision.com/address/0x4D6279c3DD0369e788C33b3aE1297D4E9abbd01a) |
| Indexer (GraphQL) | [`indexer.dev.hyperindex.xyz/b5ebb5c/v1/graphql`](https://indexer.dev.hyperindex.xyz/b5ebb5c/v1/graphql) |
| Live cycles | [docs/e2e-testnet-run.md](docs/e2e-testnet-run.md): score 0 → 17 → 32 → 49, limit 100.00 → 108.61 → 117.55 → 129.64 AUSD on 150 AUSD collateral |

All addresses, the contract architecture and the scoring formula are in [contracts/README.md](contracts/README.md). Who is trusted for what is in [contracts/TRUST.md](contracts/TRUST.md).

## What is real, and what is not yet

| Layer | Status |
|---|---|
| Credit line, scoring, limits, defaults | Live contracts on Monad testnet, verified |
| Stablecoin | Agora's AUSD on Monad testnet |
| Collateral yield | MockEarnAUSD stands in for earnAUSD, which is mainnet only |
| Backend: payments, KYC, relayer, API | Live at [`api.matocard.xyz`](https://api.matocard.xyz/docs) (Swagger). Money in by ringgit (Xendit Malaysia) or rupiah (Xendit Indonesia), out in rupiah; Xendit and Didit in test mode |
| App | In progress |
| Card | Not issued; a licensed issuer is needed |

## Repository

```
contracts/    Foundry: credit line (UUPS proxy + modules), scoring library, testnet tokens
apps/         services and the app (api, kyc, payments, relayer, indexer, app)
packages/     shared TypeScript config and types
docs/         run records
```

## Getting started

Requires [Bun](https://bun.sh) 1.3+ and [Foundry](https://getfoundry.sh) 1.8+.

```sh
bun install
bun run lint
bun run test

cd contracts
forge install foundry-rs/forge-std --no-git
forge install OpenZeppelin/openzeppelin-contracts@v5.4.0 --no-git
forge install OpenZeppelin/openzeppelin-contracts-upgradeable@v5.4.0 --no-git
forge test
```
