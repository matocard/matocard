import { expect, test } from "bun:test";
import { createTestIndexer } from "envio";
import "../src/handlers/MatoCreditLine";

/**
 * Runs the handlers over the real Monad testnet blocks holding the deployment
 * and the first credit cycle (docs/e2e-testnet-run.md). Opt-in, because it
 * needs the network:
 *
 *   INDEXER_LIVE_TEST=1 bun test test/live.test.ts
 */
const live = process.env.INDEXER_LIVE_TEST === "1";
const borrower = "0xfc5f512ab70f769035bfbcc6e2740158acb32554";

test.skipIf(!live)(
  "indexes the first cycle on Monad testnet",
  async () => {
    const indexer = createTestIndexer();
    await indexer.process({
      chains: { 10143: { startBlock: 66_373_390, endBlock: 66_374_700 } },
    });

    const account = await indexer.Account.get(borrower);
    expect(account?.score).toBe(17n);
    expect(account?.cycleCount).toBe(1);
    expect(account?.totalToppedUp).toBe(150_000_000n);

    const cycle = await indexer.Cycle.get(`${borrower}-1`);
    expect(cycle?.outcome).toBe("Qualified");
    expect(cycle?.peakDrawn).toBe(50_000_000n);

    const pool = await indexer.Pool.get("matocard");
    expect(pool?.lenderDeposits).toBe(100_000_000_000n);
    expect(pool?.outstanding).toBe(0n);
  },
  180_000,
);
