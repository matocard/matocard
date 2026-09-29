import { expect, test } from "bun:test";
import { createTestIndexer } from "envio";
import "../src/handlers/MatoCreditLine";

/**
 * Runs the handlers over the real Monad testnet blocks holding the current
 * deployment and the demo accounts' three cycles (docs/e2e-testnet-run.md).
 * Opt-in, because it needs the network and an ENVIO_API_TOKEN:
 *
 *   INDEXER_LIVE_TEST=1 bun test test/live.test.ts
 */
const live = process.env.INDEXER_LIVE_TEST === "1";
const siti = "0xc6e0de07b60a412c1bb990b77612754b9254dbda";
const mom = "0xcc9c84af69ff5ad646a6fdcd02d092ee69c6106b";

test.skipIf(!live)(
  "indexes the demo accounts on Monad testnet",
  async () => {
    const indexer = createTestIndexer();
    await indexer.process({
      chains: { 10143: { startBlock: 66_642_498, endBlock: 66643978 } },
    });

    const account = await indexer.Account.get(siti);
    expect(account?.score).toBe(55n);
    expect(account?.cycleCount).toBe(3);
    expect(account?.repayCount).toBe(3);
    expect(account?.totalToppedUp).toBe(150_000_000n);

    const cycles = await indexer.Cycle.getWhere({ account_id: { _eq: siti } });
    expect(cycles.map((c) => c.outcome)).toEqual(["Qualified", "Qualified", "Qualified"]);

    expect((await indexer.Account.get(mom))?.identityHash).toBeDefined();

    const pool = await indexer.Pool.get("matocard");
    expect(pool?.lenderDeposits).toBe(100_000_000_000n);
    expect(pool?.lifetimeDrawn).toBe(263_490_089n);
    expect(pool?.outstanding).toBe(0n);
  },
  180_000,
);
