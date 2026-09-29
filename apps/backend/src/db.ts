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
