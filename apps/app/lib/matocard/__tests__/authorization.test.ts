import { verifyTypedData } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { expect, test, vi } from "vitest";
import type { Config } from "wagmi";
import { AUSD, MONAD_CHAIN_ID } from "../monad";

const account = privateKeyToAccount(generatePrivateKey());

vi.mock("wagmi/actions", () => ({
  // AUSD's real domain on Monad testnet: name "Agora Dollar", version "1".
  readContract: async () => ["0x0f", "Agora Dollar", "1", 10143n, AUSD, `0x${"0".repeat(64)}`, []],
  signTypedData: async (_config: unknown, args: Parameters<typeof account.signTypedData>[0]) =>
    account.signTypedData(args),
}));

const { signTransfer } = await import("../authorization");

test("a signed transfer verifies under AUSD's domain and goes out as strings", async () => {
  const to = "0xcf330A7E5D4eae35250f00B4af96eBcf38347Df1";
  const auth = await signTransfer({} as Config, { from: account.address, to, value: 200_000n });

  expect(auth).toMatchObject({ from: account.address, to, value: "200000", validAfter: "0" });
  expect(auth.nonce).toMatch(/^0x[0-9a-f]{64}$/);
  expect(Number(auth.validBefore)).toBeGreaterThan(Date.now() / 1000 + 3500);

  const valid = await verifyTypedData({
    address: account.address,
    domain: {
      name: "Agora Dollar",
      version: "1",
      chainId: MONAD_CHAIN_ID,
      verifyingContract: AUSD,
    },
    types: {
      TransferWithAuthorization: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "validAfter", type: "uint256" },
        { name: "validBefore", type: "uint256" },
        { name: "nonce", type: "bytes32" },
      ],
    },
    primaryType: "TransferWithAuthorization",
    message: {
      from: account.address,
      to,
      value: 200_000n,
      validAfter: 0n,
      validBefore: BigInt(auth.validBefore),
      nonce: auth.nonce,
    },
    signature: auth.signature,
  });
  expect(valid).toBe(true);
});

test("two sends never share a nonce", async () => {
  const a = await signTransfer({} as Config, {
    from: account.address,
    to: account.address,
    value: 1n,
  });
  const b = await signTransfer({} as Config, {
    from: account.address,
    to: account.address,
    value: 1n,
  });
  expect(a.nonce).not.toBe(b.nonce);
});
