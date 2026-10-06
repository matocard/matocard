import { beforeEach, expect, test } from "vitest";
import { connect, disconnect, E2E_ADDRESS, E2E_WALLET_NAME, getAddress } from "../wallet-e2e";

beforeEach(async () => {
  await disconnect();
});

test("the address is a well-formed EVM address", () => {
  expect(E2E_ADDRESS).toMatch(/^0x[0-9a-fA-F]{40}$/);
});

test("connect resolves a deterministic address and wallet name", async () => {
  expect(await connect()).toEqual({ address: E2E_ADDRESS, name: E2E_WALLET_NAME });
});

test("getAddress throws before connect and resolves after", async () => {
  await expect(getAddress()).rejects.toThrow("no e2e wallet connected");
  await connect();
  expect(await getAddress()).toBe(E2E_ADDRESS);
});
