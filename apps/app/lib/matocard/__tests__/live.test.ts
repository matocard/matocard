// @vitest-environment node
import { createPublicClient, http, verifyTypedData } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "viem/chains";
import { describe, expect, test, vi } from "vitest";
import type { Config } from "wagmi";
import {
  ApiError,
  getMe,
  getMyActivity,
  getQuote,
  getVerifyRecord,
  SESSION_SECONDS,
  type Session,
  sessionMessage,
  startTopUp,
  TREASURY,
} from "../backend";
import { AUSD, ausdAbi, CREDIT_LINE, creditLineAbi, limitFor, MONAD_CHAIN_ID } from "../monad";

/**
 * End to end against the live services: api.matocard.xyz and the credit line on Monad testnet.
 * A throwaway account signs in exactly as the app does, so this proves the wiring rather than a
 * mock of it. Off unless `LIVE=1` (`bun run test:live`): CI must not depend on the network, and
 * every run creates a backend user.
 */
const LIVE = process.env.LIVE === "1";
const SITI = "0xc6E0De07b60a412c1bb990B77612754B9254DBDa"; // docs/e2e-testnet-run.md

const chain = createPublicClient({
  chain: monadTestnet,
  transport: http("https://testnet-rpc.monad.xyz"),
});
const account = privateKeyToAccount(generatePrivateKey());

// `authorization.ts` reaches the token through wagmi; here wagmi is the real chain and a local key.
vi.mock("wagmi/actions", () => ({
  readContract: (_c: unknown, args: Parameters<typeof chain.readContract>[0]) =>
    chain.readContract(args),
  signTypedData: (_c: unknown, args: Parameters<typeof account.signTypedData>[0]) =>
    account.signTypedData(args),
}));

describe.skipIf(!LIVE)("live: backend and chain", () => {
  let session: Session;

  test("signing in creates the user, and /me answers from the chain", async () => {
    const until = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
    const signature = await account.signMessage({
      message: sessionMessage(account.address, until),
    });
    session = { wallet: account.address, until, signature };
    const me = await getMe(session);
    expect(me.user.wallet.toLowerCase()).toBe(account.address.toLowerCase());
    expect(me.user.kyc).toBe("none");
    expect(me.verified).toBe(false);
    expect(me.available).toBe("0");
  });

  test("a forged session is refused", async () => {
    const forged = { ...session, signature: `0x${"11".repeat(65)}` as const };
    await expect(getMe(forged)).rejects.toMatchObject({ status: 401 });
  });

  test("history answers, empty for a new account", async () => {
    const mine = await getMyActivity(session);
    expect(mine.activity).toEqual([]);
    expect(mine.inFlight).toEqual([]);
  });

  test("a USD/IDR quote is a positive rate locked for about a minute", async () => {
    const quote = await getQuote("USD/IDR");
    expect(Number(quote.rate)).toBeGreaterThan(1000);
    const ttl = Date.parse(quote.expiresAt) - Date.now();
    expect(ttl).toBeGreaterThan(30_000);
    expect(ttl).toBeLessThanOrEqual(61_000);
  });

  test("a top-up before verification is refused, with the backend's own words", async () => {
    const quote = await getQuote("USD/IDR");
    const refusal = startTopUp(session, { amount: "50000", method: "bank", quoteId: quote.id });
    await expect(refusal).rejects.toBeInstanceOf(ApiError);
    await expect(refusal).rejects.toMatchObject({
      status: 403,
      message: "verify your identity first",
    });
  });

  test("the public record matches the chain, and the app's limit maths matches the contract", async () => {
    const record = await getVerifyRecord(SITI);
    const [score, value, limit] = await Promise.all([
      chain.readContract({
        address: CREDIT_LINE,
        abi: creditLineAbi,
        functionName: "scoreOf",
        args: [SITI],
      }),
      chain.readContract({
        address: CREDIT_LINE,
        abi: creditLineAbi,
        functionName: "collateralValueOf",
        args: [SITI],
      }),
      chain.readContract({
        address: CREDIT_LINE,
        abi: creditLineAbi,
        functionName: "limitOf",
        args: [SITI],
      }),
    ]);
    expect(record.score).toBe(score.toString());
    expect(record.verified).toBe(true);
    expect(limitFor(value, score)).toBe(limit);
    expect(record.history?.cycles.every((c) => c.outcome === "Qualified")).toBe(true);
  });

  test("a signed transfer verifies under AUSD's live domain", async () => {
    const { signTransfer } = await import("../authorization");
    const auth = await signTransfer({} as Config, {
      from: account.address,
      to: TREASURY,
      value: 1n,
      validForSeconds: 600,
    });
    const [, name, version] = await chain.readContract({
      address: AUSD,
      abi: ausdAbi,
      functionName: "eip712Domain",
    });
    expect(name).toBe("Agora Dollar");
    const valid = await verifyTypedData({
      address: account.address,
      domain: { name, version, chainId: MONAD_CHAIN_ID, verifyingContract: AUSD },
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
        to: TREASURY,
        value: 1n,
        validAfter: 0n,
        validBefore: BigInt(auth.validBefore),
        nonce: auth.nonce,
      },
      signature: auth.signature,
    });
    expect(valid).toBe(true);
  });
});
