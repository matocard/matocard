import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { DepositMethod, matoCreditLineAbi, monadTestnet } from "../src";

/**
 * The same addresses live in this package, the indexer config and the READMEs.
 * A redeploy that updates one and not the others fails nothing at runtime: the
 * app reads one contract while the indexer follows another. So they are
 * compared here.
 */
const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("the indexer follows the same proxy from the same block", () => {
  const config = read("../../../apps/indexer/config.yaml");
  expect(config.toLowerCase()).toContain(monadTestnet.matoCreditLine.toLowerCase());
  expect(config).toContain(`start_block: ${monadTestnet.deployBlock}`);
});

test("the contracts README lists the same deployment", () => {
  const readme = read("../../../contracts/README.md");
  for (const address of [monadTestnet.matoCreditLine, monadTestnet.ausd, monadTestnet.yieldVault]) {
    expect(readme).toContain(address);
  }
});

test("the ABI carries every event the contract declares", () => {
  const solidity = read("../../../contracts/src/interfaces/IMatoCreditLine.sol");
  const declared = [...solidity.matchAll(/event (\w+)\(/g)].map((m) => m[1]);
  const inAbi = matoCreditLineAbi
    .filter((item) => item.type === "event")
    .map((e): string => e.name);
  expect(declared.filter((name) => !inAbi.includes(name as string))).toEqual([]);
});

test("the ABI has what the services call", () => {
  const functions = matoCreditLineAbi
    .filter((i) => i.type === "function")
    .map((f): string => f.name);
  for (const name of [
    "setVerified",
    "depositFor",
    "cancelPending",
    "repayFor",
    "draw",
    "repay",
    "limitOf",
    "availableOf",
    "scoreOf",
    "accountOf",
    "collateralValueOf",
  ]) {
    expect(functions).toContain(name);
  }
});

test("DepositMethod matches the Solidity enum order", () => {
  const types = read("../../../contracts/src/types/CreditTypes.sol");
  const body = types.match(/enum DepositMethod \{([^}]*)\}/)?.[1] ?? "";
  const members = body
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  expect(members).toEqual(Object.keys(DepositMethod));
  members.forEach((name, i) => {
    expect(DepositMethod[name as keyof typeof DepositMethod]).toBe(i as 0 | 1);
  });
});
