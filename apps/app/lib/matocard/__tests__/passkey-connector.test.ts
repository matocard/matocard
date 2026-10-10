import { http, verifyMessage, verifyTypedData } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createConfig } from "wagmi";
import { connect, signMessage, signTypedData } from "wagmi/actions";
import { monadTestnet } from "../wagmi";

// A throwaway key stands in for the one Mera derives from the passkey.
const account = privateKeyToAccount(
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
);
let stored: { credentialId: string; address: `0x${string}` } | null = null;

vi.mock("../../passkey", () => ({
  createPasskeyAccount: vi.fn(async () => {
    stored = { credentialId: "abc", address: account.address };
    return account;
  }),
  unlockPasskeyAccount: vi.fn(async () => account),
  storedPasskey: () => stored,
  forgetPasskey: () => {
    stored = null;
  },
}));

const { passkeyConnector, setPasskeyMode } = await import("../passkey-connector");

const config = createConfig({
  chains: [monadTestnet as never],
  connectors: [passkeyConnector()],
  transports: { [monadTestnet.id]: http() } as never,
});

test("a new passkey connects and signs the backend session the backend can verify", async () => {
  setPasskeyMode("create");
  const { accounts } = await connect(config, { connector: config.connectors[0] });
  expect(accounts[0]).toBe(account.address);
  expect(stored?.address).toBe(account.address);

  const message = "Sign in to Matocard";
  const signature = await signMessage(config, { message });
  expect(await verifyMessage({ address: account.address, message, signature })).toBe(true);
});

test("typed data (the ERC-3009 transfer shape) signs and verifies", async () => {
  const typed = {
    domain: { name: "AUSD", version: "1", chainId: 10143, verifyingContract: account.address },
    types: {
      TransferWithAuthorization: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
      ],
    },
    primaryType: "TransferWithAuthorization",
    message: { from: account.address, to: account.address, value: 1n },
  } as const;
  const signature = await signTypedData(config, typed);
  expect(await verifyTypedData({ address: account.address, ...typed, signature })).toBe(true);
});
