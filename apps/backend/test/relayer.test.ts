import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { testAusdAbi } from "@matocard/contracts";
import { createWalletClient, type Hex, http, keccak256, toHex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { type Chain, createChain } from "../src/chain";
import { DEPLOYER_PK, hasAnvil, hasDatabase, testChain, testConfig, testDatabase } from "./harness";

let db: Awaited<ReturnType<typeof testDatabase>>;
let anvil: Awaited<ReturnType<typeof testChain>>;
let chain: Chain;
const siti = privateKeyToAccount(generatePrivateKey());
const mom = privateKeyToAccount(generatePrivateKey());
const identity = keccak256(toHex("siti"));

describe.skipIf(!hasDatabase || !hasAnvil)("relayer on anvil", () => {
  beforeAll(async () => {
    [db, anvil] = await Promise.all([testDatabase(), testChain()]);
    chain = createChain(db.sql, testConfig(db, anvil));
    // the relayer is the treasury: it pays deposits and repayments in AUSD
    const treasury = createWalletClient({
      account: privateKeyToAccount(DEPLOYER_PK),
      transport: http(anvil.rpcUrl),
    });
    await waitFor(
      await treasury.writeContract({
        chain: null,
        address: anvil.ausd,
        abi: testAusdAbi,
        functionName: "mint",
        args: [chain.relayer, 10_000_000_000n],
      }),
    );
  }, 60_000);

  afterAll(async () => {
    anvil?.stop();
    await db?.drop();
  });

  test("setVerified binds once, and repeating it is a no-op", async () => {
    await chain.setVerified(siti.address, identity);
    expect(await chain.read.identityOf(siti.address)).toBe(identity);
    await chain.setVerified(siti.address, identity);
    await expect(chain.setVerified(siti.address, keccak256(toHex("other")))).rejects.toThrow(
      /another identity/,
    );
  });

  test("an identity already bound elsewhere is refused before anything is sent", async () => {
    await expect(chain.setVerified(mom.address, identity)).rejects.toThrow(/IdentityTaken/);
    const [row] =
      await db.sql`SELECT count(*)::int AS n FROM relayer_txs WHERE wallet = ${mom.address.toLowerCase()}`;
    expect(row.n).toBe(0);
  });

  test("a card deposit is credited as pending shares, approving once", async () => {
    const { shares, countsFrom } = await chain.depositFor(siti.address, 150_000_000n, "card");
    expect(shares).toBeGreaterThan(0n);
    expect(countsFrom).toBeGreaterThan(BigInt(Math.floor(Date.now() / 1000)));
    expect((await chain.read.collateralOf(siti.address)).pendingShares).toBe(shares);
    await chain.depositFor(siti.address, 1_000_000n, "bank");
    const kinds = await db.sql`SELECT kind, status FROM relayer_txs ORDER BY id`;
    expect(kinds.filter((r: { kind: string }) => r.kind === "approve").length).toBe(1);
    expect(kinds.every((r: { status: string }) => r.status === "confirmed")).toBe(true);
  });

  test("the daily cap per user is enforced before sending", async () => {
    await expect(chain.depositFor(siti.address, 900_000_000n, "bank")).rejects.toThrow(
      /daily cap per user/,
    );
  });

  test("cancelPending returns a card deposit still in its hold", async () => {
    const { pendingShares } = await chain.read.collateralOf(siti.address);
    await chain.cancelPending(siti.address, pendingShares);
    expect((await chain.read.collateralOf(siti.address)).pendingShares).toBe(0n);
  });

  test("concurrent sends queue on one nonce sequence", async () => {
    const people = [1, 2, 3, 4, 5].map(() => privateKeyToAccount(generatePrivateKey()).address);
    await Promise.all(people.map((p) => chain.drip(p)));
    const rows = await db.sql`SELECT nonce FROM relayer_txs WHERE kind = 'drip' ORDER BY nonce`;
    const nonces = rows.map((r: { nonce: number }) => r.nonce);
    expect(new Set(nonces).size).toBe(5);
    expect(nonces.at(-1) - nonces[0]).toBe(4);
  });

  test("repayFor pays a borrower's debt from the treasury", async () => {
    // Siti borrows 20 against her bank deposit (1 AUSD is too little), so give her more
    await chain.depositFor(siti.address, 60_000_000n, "bank");
    await chain.drip(siti.address);
    const sitiWallet = createWalletClient({ account: siti, transport: http(anvil.rpcUrl) });
    const { matoCreditLineAbi } = await import("@matocard/contracts");
    const hash = await sitiWallet.writeContract({
      chain: null,
      address: anvil.creditLine,
      abi: matoCreditLineAbi,
      functionName: "draw",
      args: [20_000_000n, mom.address],
    });
    await waitFor(hash);
    const { repaid } = await chain.repayFor(siti.address, 50_000_000n);
    expect(repaid).toBe(20_000_000n); // capped at what is owed
    expect((await chain.read.accountOf(siti.address)).drawn).toBe(0n);
  });

  test("an ERC-3009 transfer signed by the sender is submitted by the relayer", async () => {
    // Mom holds the 20 AUSD Siti drew to her
    const nonce = keccak256(toHex("send-1"));
    const message = {
      from: mom.address,
      to: siti.address,
      value: 5_000_000n,
      validAfter: 0n,
      validBefore: BigInt(Math.floor(Date.now() / 1000) + 3600),
      nonce,
    };
    const signature = await mom.signTypedData({
      domain: {
        name: "Test AUSD (no value)",
        version: "1",
        chainId: 31337,
        verifyingContract: anvil.ausd,
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
      message,
    });
    const before = await chain.read.ausdBalanceOf(siti.address);
    await chain.transferWithAuthorization({ ...message, signature });
    expect(await chain.read.ausdBalanceOf(siti.address)).toBe(before + 5_000_000n);
    await expect(chain.transferWithAuthorization({ ...message, signature })).rejects.toThrow();
  });
});

async function waitFor(hash: Hex) {
  const { createPublicClient } = await import("viem");
  await createPublicClient({ transport: http(anvil.rpcUrl) }).waitForTransactionReceipt({ hash });
}
