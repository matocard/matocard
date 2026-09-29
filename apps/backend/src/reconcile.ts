import type { SQL } from "bun";
import type { Address } from "viem";
import type { Indexer } from "./api";

/**
 * Daily reconciliation (#49, PLAN §7.2 rule 5, D10): what the database says the
 * relayer credited must equal what the chain says it credited. Reports, never
 * fixes. Returns the mismatches; empty means the day balances.
 */
export async function reconcile(sql: SQL, indexer: Indexer, relayer: Address, day: string) {
  const start = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(start.getTime())) throw new Error(`not a day: ${day}`);
  const end = new Date(start.getTime() + 86_400_000);

  // the moment each payment went onchain, from its own transition log
  const [db] = await sql`
    SELECT
      coalesce(sum(p.ausd_amount) FILTER (WHERE p.kind = 'topup'), 0)::text AS topups,
      count(*) FILTER (WHERE p.kind = 'topup')::int AS "topupCount"
    FROM payments p JOIN payment_transitions t ON t.payment_id = p.id AND t.to_status = 'CREDITED_ONCHAIN'
    WHERE t.created_at >= ${start} AND t.created_at < ${end}`;
  // repayments book what actually landed, which the ledger holds (capped at what was owed)
  const [repaid] = await sql`
    SELECT coalesce(sum(l.debit), 0)::text AS amount FROM ledger l
    JOIN payment_transitions t ON t.payment_id = l.ref_id AND t.to_status = 'CREDITED_ONCHAIN'
    WHERE l.account LIKE 'debt:%' AND t.created_at >= ${start} AND t.created_at < ${end}`;

  const chain = await indexer<{
    DailyTopUp_by_pk: { relayerAssets: string; relayerCount: number } | null;
    Activity: { amount: string }[];
  }>(
    `query ($day: String!, $relayer: String!, $from: numeric!, $to: numeric!) {
      DailyTopUp_by_pk(id: $day) { relayerAssets relayerCount }
      Activity(where: { kind: { _eq: "Repay" }, counterparty: { _eq: $relayer },
        timestamp: { _gte: $from, _lt: $to } }) { amount } }`,
    {
      day,
      relayer: relayer.toLowerCase(),
      from: String(start.getTime() / 1000),
      to: String(end.getTime() / 1000),
    },
  );
  if (!chain) throw new Error("INDEXER_URL is not set; nothing to reconcile against");

  const onchainTopups = BigInt(chain.DailyTopUp_by_pk?.relayerAssets ?? 0);
  const onchainCount = chain.DailyTopUp_by_pk?.relayerCount ?? 0;
  const onchainRepays = chain.Activity.reduce((sum, a) => sum + BigInt(a.amount), 0n);
  const mismatches: string[] = [];
  if (BigInt(db.topups) !== onchainTopups)
    mismatches.push(`top-ups: database ${db.topups}, chain ${onchainTopups}`);
  if (db.topupCount !== onchainCount)
    mismatches.push(`top-up count: database ${db.topupCount}, chain ${onchainCount}`);
  if (BigInt(repaid.amount) !== onchainRepays)
    mismatches.push(`repayments: database ${repaid.amount}, chain ${onchainRepays}`);
  return mismatches;
}

/** By hand: `bun src/reconcile.ts [YYYY-MM-DD]`, yesterday (UTC) by default. Exits 1 on a mismatch. */
if (import.meta.main) {
  const { loadConfig } = await import("./config");
  const { connect } = await import("./db");
  const { createChain } = await import("./chain");
  const { createIndexer } = await import("./api");
  const config = loadConfig();
  const sql = connect(config.databaseUrl);
  const day = process.argv[2] ?? new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const mismatches = await reconcile(
    sql,
    createIndexer(config.indexerUrl),
    createChain(sql, config).relayer,
    day,
  );
  await sql.close();
  if (mismatches.length) {
    console.error(`${day} does not reconcile:\n  ${mismatches.join("\n  ")}`);
    process.exit(1);
  }
  console.log(`${day} reconciles`);
}
