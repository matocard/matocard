import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

/**
 * The indexer must hear every event the credit line can emit, and must not
 * listen for one it never emits. A missing entry produces no error: the indexer
 * reports itself synced and the rows simply never appear. So both lists are
 * read and compared in both directions.
 */
const solidity = readFileSync(
  new URL("../../../contracts/src/interfaces/IMatoCreditLine.sol", import.meta.url),
  "utf8",
);
const config = readFileSync(new URL("../config.yaml", import.meta.url), "utf8");

/** Admin-only; nothing a screen shows depends on it. */
const IGNORED = new Set(["ParamsChanged"]);
/** Inherited from ERC4626, so not in our interface. */
const INHERITED = new Set(["Deposit", "Withdraw"]);

const emitted = [...solidity.matchAll(/event (\w+)\(/g)]
  .map((m) => m[1] as string)
  .filter((name) => !IGNORED.has(name));
const indexed = [...config.matchAll(/- event: (\w+)\(/g)].map((m) => m[1] as string);

test("every event the contract emits is indexed", () => {
  expect(emitted.filter((name) => !indexed.includes(name))).toEqual([]);
});

test("the indexer listens for nothing the contract does not emit", () => {
  const unknown = indexed.filter((name) => !emitted.includes(name) && !INHERITED.has(name));
  expect(unknown).toEqual([]);
});

test("every indexed event has a handler", () => {
  const handlers = readFileSync(
    new URL("../src/handlers/MatoCreditLine.ts", import.meta.url),
    "utf8",
  );
  const handled = [...handlers.matchAll(/event: "(\w+)"/g)].map((m) => m[1]);
  expect(indexed.filter((name) => !handled.includes(name))).toEqual([]);
});
