import { describe, expect, test } from "bun:test";
import { createTestIndexer } from "envio";
import "../src/handlers/MatoCreditLine";

const CHAIN = 10143;
const START = 66_642_498;
const AUSD = 1_000_000n;

const ayu = "0x0000000000000000000000000000000000000a70";
const shop = "0x0000000000000000000000000000000000005e11";
const relayer = "0x0000000000000000000000000000000000000abc";
const lender = "0x0000000000000000000000000000000000001e1d";

function at(n: number) {
  return { number: START + n, timestamp: 1_790_000_000 + n * 60 };
}

describe("reversals, partial draws, a miss and a default", async () => {
  const indexer = createTestIndexer();
  await indexer.process({
    chains: {
      [CHAIN]: {
        startBlock: START,
        simulate: [
          {
            contract: "MatoCreditLine",
            event: "Deposit",
            block: at(1),
            params: { sender: lender, owner: lender, assets: 10_000n * AUSD, shares: 1n },
          },
          {
            contract: "MatoCreditLine",
            event: "Verified",
            block: at(2),
            params: { wallet: ayu, identityHash: `0x${"22".repeat(32)}` },
          },
          // card top-up reversed inside its hold
          {
            contract: "MatoCreditLine",
            event: "CollateralDeposited",
            block: at(3),
            params: {
              account: ayu,
              payer: relayer,
              method: 1n,
              assets: 40n * AUSD,
              shares: 40n * AUSD,
              countsFrom: BigInt(at(4).timestamp),
            },
          },
          {
            contract: "MatoCreditLine",
            event: "PendingCancelled",
            block: at(3),
            params: { account: ayu, shares: 40n * AUSD, to: relayer },
          },
          // direct deposit, counts at once
          {
            contract: "MatoCreditLine",
            event: "CollateralDeposited",
            block: at(4),
            params: {
              account: ayu,
              payer: ayu,
              method: 0n,
              assets: 150n * AUSD,
              shares: 150n * AUSD,
              countsFrom: BigInt(at(4).timestamp),
            },
          },
          // cycle 1: two draws, repaid too fast, does not qualify
          {
            contract: "MatoCreditLine",
            event: "Drawn",
            block: at(5),
            params: { account: ayu, to: shop, amount: 20n * AUSD, drawn: 20n * AUSD },
          },
          {
            contract: "MatoCreditLine",
            event: "Drawn",
            block: at(5),
            params: { account: ayu, to: shop, amount: 10n * AUSD, drawn: 30n * AUSD },
          },
          {
            contract: "MatoCreditLine",
            event: "CycleClosed",
            block: at(5),
            params: { account: ayu, qualifying: false, score: 0n },
          },
          {
            contract: "MatoCreditLine",
            event: "Repaid",
            block: at(5),
            params: { account: ayu, payer: ayu, amount: 30n * AUSD, drawn: 0n },
          },
          // cycle 2: drawn, partly repaid, defaulted
          {
            contract: "MatoCreditLine",
            event: "Drawn",
            block: at(6),
            params: { account: ayu, to: shop, amount: 90n * AUSD, drawn: 90n * AUSD },
          },
          {
            contract: "MatoCreditLine",
            event: "Repaid",
            block: at(7),
            params: { account: ayu, payer: ayu, amount: 10n * AUSD, drawn: 80n * AUSD },
          },
          {
            contract: "MatoCreditLine",
            event: "Defaulted",
            block: at(8),
            params: { account: ayu, writtenOff: 80n * AUSD, sharesSeized: 80n * AUSD, score: 0n },
          },
          {
            contract: "MatoCreditLine",
            event: "PoolSharesRedeemed",
            block: at(9),
            params: { shares: 80n * AUSD, assets: 80n * AUSD },
          },
          {
            contract: "MatoCreditLine",
            event: "Withdraw",
            block: at(10),
            params: {
              sender: lender,
              receiver: lender,
              owner: lender,
              assets: 1_000n * AUSD,
              shares: 1n,
            },
          },
        ],
      },
    },
  });

  test("a reversed card top-up leaves nothing pending", async () => {
    const account = await indexer.Account.get(ayu);
    expect(account?.pendingShares).toBe(0n);
    expect(account?.pendingUntil).toBeUndefined();
  });

  test("reconciliation separates relayer, direct and reversed", async () => {
    const day = new Date(at(3).timestamp * 1000).toISOString().slice(0, 10);
    const row = await indexer.DailyTopUp.get(day);
    expect(row?.relayerAssets).toBe(40n * AUSD);
    expect(row?.directAssets).toBe(150n * AUSD);
    expect(row?.reversedShares).toBe(40n * AUSD);
  });

  test("two draws in one cycle share a row and a peak", async () => {
    const first = await indexer.Cycle.get(`${ayu}-1`);
    expect(first?.totalDrawn).toBe(30n * AUSD);
    expect(first?.peakDrawn).toBe(30n * AUSD);
    expect(first?.outcome).toBe("NotQualified");
  });

  test("a default closes the open cycle and marks the account", async () => {
    const second = await indexer.Cycle.get(`${ayu}-2`);
    expect(second?.outcome).toBe("Defaulted");
    expect(second?.totalRepaid).toBe(10n * AUSD);
    expect(second?.writtenOff).toBe(80n * AUSD);

    const account = await indexer.Account.get(ayu);
    expect(account?.defaulted).toBe(true);
    expect(account?.cyclesOpened).toBe(2);
    expect(account?.cycleCount).toBe(1); // the default, not the missed cycle
    expect(account?.repayCount).toBe(0);
    expect(account?.drawn).toBe(0n);
    expect(account?.totalWrittenOff).toBe(80n * AUSD);
  });

  test("pool totals net out", async () => {
    const pool = await indexer.Pool.get("matocard");
    expect(pool?.outstanding).toBe(0n);
    expect(pool?.lifetimeDrawn).toBe(120n * AUSD);
    expect(pool?.lifetimeRepaid).toBe(40n * AUSD);
    expect(pool?.lifetimeWrittenOff).toBe(80n * AUSD);
    expect(pool?.defaultCount).toBe(1);
    expect(pool?.lenderDeposits).toBe(10_000n * AUSD);
    expect(pool?.lenderWithdrawals).toBe(1_000n * AUSD);
    expect(pool?.seizedRedeemed).toBe(80n * AUSD);
  });
});
