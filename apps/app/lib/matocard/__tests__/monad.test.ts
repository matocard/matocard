import { expect, test } from "vitest";
import { AUSD, CREDIT_LINE, explorerTx, limitFor, MONAD_CHAIN_ID, ratioBps } from "../monad";

const AUSD_150 = 150_000_000n; // 6 decimals

test("ratio and limit match PLAN §6.3 and the live testnet run, to the last unit", () => {
  expect(ratioBps(0n)).toBe(15_000n);
  expect(limitFor(AUSD_150, 0n)).toBe(100_000_000n); // 100.00
  expect(ratioBps(17n)).toBe(13_810n);
  expect(limitFor(AUSD_150, 17n)).toBe(108_616_944n); // docs/e2e-testnet-run.md
  expect(ratioBps(55n)).toBe(11_150n);
  expect(limitFor(AUSD_150, 55n)).toBe(134_529_147n); // "Siti, 3 months later"
  expect(ratioBps(100n)).toBe(8_000n);
  expect(ratioBps(250n)).toBe(8_000n); // bounded like the contract
});

test("the deployment comes from @matocard/contracts", () => {
  expect(MONAD_CHAIN_ID).toBe(10143);
  expect(CREDIT_LINE).toBe("0x4D6279c3DD0369e788C33b3aE1297D4E9abbd01a");
  expect(AUSD).toBe("0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC");
  expect(explorerTx("0xabc")).toBe("https://testnet.monadvision.com/tx/0xabc");
});
