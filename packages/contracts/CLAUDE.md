# @matocard/contracts

Typed ABIs, Monad testnet addresses and gas limits for viem. Consumed by the backend and the app as
`"@matocard/contracts": "workspace:*"`; it ships TypeScript source, no build step.

- `src/abi/*` is **generated** by `contracts/script/export-abi.sh`. Never edit by hand; Biome skips it.
- `src/addresses.ts` must agree with the indexer's `config.yaml` and the READMEs; `test/package.test.ts`
  checks that.
- `gasLimits` are bigints from `src/gas-limits.json`. Send them as `gas` on every write: Monad
  charges the limit, not gas used. `markDefaulted` has no published limit; estimate it.
- `testAusdAbi` doubles as AUSD's ABI for `permit` and ERC-3009 (`transferWithAuthorization`).
  Read the EIP-712 domain from `eip712Domain()`: real AUSD's name is `Agora Dollar`, not `AUSD`.
- `DepositMethod` mirrors the Solidity enum: `Bank: 0, Card: 1`. AUSD has 6 decimals.
