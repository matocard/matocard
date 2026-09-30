# @matocard/contracts

ABIs and deployed addresses for the Matocard contracts, typed for [viem](https://viem.sh).

```ts
import { DepositMethod, matoCreditLineAbi, monadTestnet } from "@matocard/contracts";

// read
const limit = await client.readContract({
  address: monadTestnet.matoCreditLine,
  abi: matoCreditLineAbi,
  functionName: "limitOf",
  args: [wallet],
});

// relayer: credit a card top-up of 150 AUSD (6 decimals)
await walletClient.writeContract({
  address: monadTestnet.matoCreditLine,
  abi: matoCreditLineAbi,
  functionName: "depositFor",
  args: [wallet, 150_000_000n, DepositMethod.Card],
});
```

Monad charges for the gas **limit**, not gas used, so send the published limit instead of estimating:

```ts
import { gasLimits } from "@matocard/contracts";

await walletClient.writeContract({ /* … */ functionName: "draw", args, gas: gasLimits.draw });
```

Each limit is the largest estimate Monad testnet gave for that call (first-time accounts, cycle-closing repayments) plus 25%. `markDefaulted` has never run on testnet, so estimate it. A Foundry test fails if a call's heaviest case outgrows its limit.

**AUSD.** `monadTestnet.ausd` is Agora's AUSD. `testAusdAbi` has the same `permit` and ERC-3009 selectors (`transferWithAuthorization`, `receiveWithAuthorization`, `cancelAuthorization`), so it works as AUSD's ABI for those calls. Read the EIP-712 domain from `eip712Domain()`: AUSD's is named `Agora Dollar`, not `AUSD`.

Add it to a workspace with `"@matocard/contracts": "workspace:*"`.

The files in `src/abi` are generated; after changing a contract run `contracts/script/export-abi.sh`. CI fails if they are out of date.
