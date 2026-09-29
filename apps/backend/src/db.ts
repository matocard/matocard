import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { SQL } from "bun";

const MIGRATIONS = join(import.meta.dir, "../migrations");

// bigint: int8 columns hold money, and must not come back as lossy numbers
export const connect = (url: string) => new SQL({ url, bigint: true });

/** Applies migrations/*.sql not yet applied, in name order, each in its own transaction. */
export async function migrate(sql: SQL): Promise<string[]> {
  await sql`CREATE TABLE IF NOT EXISTS schema_migrations (
    name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`;
  const done = new Set(
    (await sql`SELECT name FROM schema_migrations`).map((r: { name: string }) => r.name),
  );
  const pending = (await readdir(MIGRATIONS))
    .filter((f) => f.endsWith(".sql") && !done.has(f))
    .sort();
  for (const name of pending) {
    await sql.begin(async (tx) => {
      await tx.unsafe(await Bun.file(join(MIGRATIONS, name)).text());
      await tx`INSERT INTO schema_migrations (name) VALUES (${name})`;
    });
  }
  return pending;
}

/**
 * One double entry in the append-only ledger (PLAN §7.2 rule 4): `amount`
 * moves from `from` to `to`. Each currency balances on its own; `fx` is where
 * fiat turns into AUSD and back.
 */
export function post(
  sql: SQL,
  ref: { type: "payment" | "payout"; id: string },
  from: string,
  to: string,
  amount: bigint,
  currency: string,
) {
  if (amount <= 0n) return Promise.resolve();
  return sql`
    INSERT INTO ledger (ref_type, ref_id, account, debit, credit, currency) VALUES
      (${ref.type}, ${ref.id}, ${to}, ${amount}, 0, ${currency}),
      (${ref.type}, ${ref.id}, ${from}, 0, ${amount}, ${currency})`;
}

/**
 * Handles a webhook delivery once (rule 2). If handling throws, the delivery is
 * forgotten again so the provider's retry is not mistaken for a duplicate.
 */
export async function once(
  sql: SQL,
  provider: string,
  eventId: string,
  handle: () => Promise<void>,
) {
  const rows = await sql`
    INSERT INTO webhook_events (provider, event_id) VALUES (${provider}, ${eventId})
    ON CONFLICT DO NOTHING RETURNING event_id`;
  if (rows.length === 0) return false;
  try {
    await handle();
  } catch (error) {
    await sql`DELETE FROM webhook_events WHERE provider = ${provider} AND event_id = ${eventId}`;
    throw error;
  }
  return true;
}
