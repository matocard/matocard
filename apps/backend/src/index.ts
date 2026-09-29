import { createIndexer, createRoutes } from "./api";
import { createChain } from "./chain";
import { loadConfig } from "./config";
import { connect, migrate } from "./db";
import { createFx } from "./fx";
import { json } from "./http";
import { createKyc } from "./kyc";
import { createPayments } from "./payments";
import { reconcile } from "./reconcile";

const config = loadConfig();
const sql = connect(config.databaseUrl);
const applied = await migrate(sql);
if (applied.length) console.log(`migrated: ${applied.join(", ")}`);

const chain = createChain(sql, config);
const fx = createFx(sql);
const payments = createPayments(sql, chain, fx, config);
const kyc = createKyc(sql, chain, config);
const indexer = createIndexer(config.indexerUrl);

// ponytail: one worker loop in this process; every onchain step runs here, one at a time
let working: Promise<void> | null = null;
let again = false;
function wake() {
  if (working) {
    again = true;
    return;
  }
  working = (async () => {
    do {
      again = false;
      await kyc.work().catch((e) => console.error("kyc work:", e));
      await payments.work().catch((e) => console.error("payments work:", e));
    } while (again);
  })().finally(() => {
    working = null;
  });
}
setInterval(wake, 5_000);
wake();

// yesterday's reconciliation, once a day shortly after midnight UTC
let reconciled = "";
setInterval(async () => {
  const now = new Date();
  const yesterday = new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10);
  if (
    now.getUTCHours() !== 0 ||
    now.getUTCMinutes() < 10 ||
    reconciled === yesterday ||
    !config.indexerUrl
  )
    return;
  reconciled = yesterday;
  const mismatches = await reconcile(sql, indexer, chain.relayer, yesterday).catch((e) => [
    String(e),
  ]);
  if (mismatches.length)
    console.error(`RECONCILIATION ${yesterday}:\n  ${mismatches.join("\n  ")}`);
  else console.log(`reconciled ${yesterday}`);
}, 60_000);

const server = Bun.serve({
  port: config.port,
  routes: createRoutes({ sql, chain, fx, payments, kyc, indexer, wake }),
  fetch: () => json({ error: "not found" }, 404),
});
console.log(`backend on :${server.port}, relayer ${chain.relayer}`);
