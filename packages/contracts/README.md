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

Add it to a workspace with `"@matocard/contracts": "workspace:*"`.

The files in `src/abi` are generated; after changing a contract run `contracts/script/export-abi.sh`. CI fails if they are out of date.
