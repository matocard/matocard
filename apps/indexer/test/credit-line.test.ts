import { describe, expect, test } from "bun:test";
import { createTestIndexer } from "envio";
import "../src/handlers/MatoCreditLine";

const CHAIN = 10143;
const START = 66_922_881;
const AUSD = 1_000_000n;

const siti = "0x00000000000000000000000000000000000051d1";
const mom = "0x000000000000000000000000000000000000beef";
const relayer = "0x0000000000000000000000000000000000000abc";
const idHash = `0x${"11".repeat(32)}`;

/** Block `n` after the deployment, one second apart. */
function at(n: number) {
  return { number: START + n, timestamp: 1_790_000_000 + n };
}

describe("a verified borrower's first cycle", async () => {
  const indexer = createTestIndexer();
  await indexer.process({
    chains: {
      [CHAIN]: {
        startBlock: START,
        simulate: [
          {
            contract: "MatoCreditLine",
            event: "Verified",
            block: at(1),
            params: { wallet: siti, identityHash: idHash },
          },
          {
            contract: "MatoCreditLine",
            event: "CollateralDeposited",
            block: at(2),
            params: {
              account: siti,
              payer: relayer,
              method: 1n,
              assets: 150n * AUSD,
              shares: 150n * AUSD,
              countsFrom: BigInt(at(62).timestamp),
            },
          },
          {
            contract: "MatoCreditLine",
            event: "PendingSettled",
            block: at(70),
            params: { account: siti, shares: 150n * AUSD },
          },
          {
            contract: "MatoCreditLine",
            event: "Drawn",
            block: at(70),
            params: { account: siti, to: mom, amount: 50n * AUSD, drawn: 50n * AUSD },
          },
          {
            contract: "MatoCreditLine",
            event: "CycleClosed",
            block: at(140),
            params: { account: siti, qualifying: true, score: 17n },
          },
          {
            contract: "MatoCreditLine",
            event: "Repaid",
            block: at(140),
            params: { account: siti, payer: siti, amount: 50n * AUSD, drawn: 0n },
          },
        ],
      },
    },
  });

  const account = await indexer.Account.get(siti);

  test("account carries the contract's score and counters", () => {
    expect(account?.score).toBe(17n);
    expect(account?.cycleCount).toBe(1);
    expect(account?.repayCount).toBe(1);
    expect(account?.drawn).toBe(0n);
    expect(account?.identityHash).toBe(idHash);
  });

  test("the card hold is tracked and then cleared", () => {
    expect(account?.pendingShares).toBe(0n);
    expect(account?.pendingUntil).toBeUndefined();
    expect(account?.totalToppedUp).toBe(150n * AUSD);
  });

  test("the cycle closes as qualified with its dates", async () => {
    const cycle = await indexer.Cycle.get(`${siti}-1`);
    expect(cycle?.outcome).toBe("Qualified");
    expect(cycle?.peakDrawn).toBe(50n * AUSD);
    expect(cycle?.totalRepaid).toBe(50n * AUSD);
    expect(cycle?.openedAt).toBe(BigInt(at(70).timestamp));
    expect(cycle?.closedAt).toBe(BigInt(at(140).timestamp));
    expect(cycle?.scoreAfter).toBe(17n);
  });

  test("every event lands in the activity feed", async () => {
    const rows = await indexer.Activity.getWhere({ account_id: { _eq: siti } });
    expect(rows.map((r): string => r.kind).sort()).toEqual(
      ["Draw", "Repay", "TopUp", "TopUpCleared", "Verified"].sort(),
    );
    const draw = rows.find((r) => r.kind === "Draw");
    expect(draw?.counterparty).toBe(mom);
    expect(rows.find((r) => r.kind === "TopUp")?.method).toBe("Card");
  });

  test("the score change is kept as history", async () => {
    const changes = await indexer.ScoreChange.getWhere({ account_id: { _eq: siti } });
    expect(changes).toHaveLength(1);
    expect(changes[0]?.previous).toBe(0n);
    expect(changes[0]?.score).toBe(17n);
  });

  test("the relayer top-up is counted for reconciliation", async () => {
    const day = new Date(at(2).timestamp * 1000).toISOString().slice(0, 10);
    const row = await indexer.DailyTopUp.get(day);
    expect(row?.relayerAssets).toBe(150n * AUSD);
    expect(row?.relayerCount).toBe(1);
    expect(row?.directCount).toBe(0);
  });

  test("pool totals follow", async () => {
    const pool = await indexer.Pool.get("matocard");
    expect(pool?.verifiedAccounts).toBe(1);
    expect(pool?.outstanding).toBe(0n);
    expect(pool?.lifetimeDrawn).toBe(50n * AUSD);
    expect(pool?.lifetimeRepaid).toBe(50n * AUSD);
  });
});
