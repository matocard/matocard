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

**TestAUSD and ERC-3009.** `testAusdAbi` includes `permit` and the ERC-3009 functions (`transferWithAuthorization`, `receiveWithAuthorization`, `cancelAuthorization`) with the same selectors as AUSD on Monad testnet.

Add it to a workspace with `"@matocard/contracts": "workspace:*"`.

The files in `src/abi` are generated; after changing a contract run `contracts/script/export-abi.sh`. CI fails if they are out of date.
