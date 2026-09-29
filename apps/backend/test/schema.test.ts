import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { SQL } from "bun";
import { connect, migrate } from "../src/db";

// Runs against a throwaway database next to DATABASE_URL (docker compose up -d postgres).
const url = process.env.DATABASE_URL;
const name = `matocard_test_${process.pid}`;
let admin: SQL;
let sql: SQL;
let userId: string;

// Bun's expect().rejects hangs on a Bun.sql query (a lazy thenable), so settle it first.
const errorOf = (query: PromiseLike<unknown>) =>
  Promise.resolve(query).then(
    () => "",
    (e: Error) => e.message,
  );

describe.skipIf(!url)("schema", () => {
  beforeAll(async () => {
    admin = connect(url!);
    await admin.unsafe(`CREATE DATABASE ${name}`);
    const testUrl = new URL(url!);
    testUrl.pathname = `/${name}`;
    sql = connect(testUrl.toString());
    await migrate(sql);
    [{ id: userId }] = await sql`
      INSERT INTO users (wallet) VALUES (${`0x${"a".repeat(40)}`}) RETURNING id`;
  });

  afterAll(async () => {
    await sql?.close();
    await admin?.unsafe(`DROP DATABASE IF EXISTS ${name}`);
    await admin?.close();
  });

  const topup = (eventId: string | null) => sql`
    INSERT INTO payments (user_id, kind, method, provider_event_id, fiat_amount, currency, ausd_amount)
    VALUES (${userId}, 'topup', 'card', ${eventId}, 60000, 'MYR', 150000000)
    RETURNING id, ausd_amount`;

  test("migrate is idempotent", async () => {
    expect(await migrate(sql)).toEqual([]);
  });

  test("money comes back as exact bigint", async () => {
    const [row] = await topup(null);
    expect(row.ausd_amount).toBe(150_000_000n);
  });

  test("a replayed webhook event cannot be recorded twice", async () => {
    await topup("evt_1");
    expect(await errorOf(topup("evt_1"))).toMatch(/provider_event_id/);
  });

  test("status follows the state machine, and every step is logged", async () => {
    const [{ id }] = await topup("evt_2");
    const to = (status: string) => sql`UPDATE payments SET status = ${status} WHERE id = ${id}`;

    expect(await errorOf(to("CREDITED_ONCHAIN"))).toMatch(/PENDING -> CREDITED_ONCHAIN/);
    await to("PAID");
    await to("CREDITED_ONCHAIN");
    await to("REVERSED");
    expect(await errorOf(to("SETTLED"))).toMatch(/not allowed/);

    const log = await sql`
      SELECT to_status FROM payment_transitions WHERE payment_id = ${id} ORDER BY id`;
    expect(log.map((r: { to_status: string }) => r.to_status)).toEqual([
      "PENDING",
      "PAID",
      "CREDITED_ONCHAIN",
      "REVERSED",
    ]);
  });

  test("a payment cannot be inserted past PENDING", async () => {
    const insert = sql`
      INSERT INTO payments (user_id, kind, method, fiat_amount, currency, ausd_amount, status)
      VALUES (${userId}, 'topup', 'card', 1, 'MYR', 1, 'PAID')`;
    expect(await errorOf(insert)).toMatch(/must start as PENDING/);
  });

  test("ledger and transitions are append-only; payments are never deleted", async () => {
    const [{ id }] = await topup("evt_3");
    await sql`INSERT INTO ledger (ref_type, ref_id, account, debit, currency)
              VALUES ('payment', ${id}, 'fiat:xendit', 60000, 'MYR')`;

    expect(await errorOf(sql`UPDATE ledger SET debit = 1`)).toMatch(/append-only/);
    expect(await errorOf(sql`DELETE FROM ledger`)).toMatch(/append-only/);
    expect(await errorOf(sql`DELETE FROM payment_transitions`)).toMatch(/append-only/);
    expect(await errorOf(sql`DELETE FROM payments WHERE id = ${id}`)).toMatch(/append-only/);
  });

  test("a ledger posting is exactly one of debit or credit", async () => {
    const [{ id }] = await topup("evt_4");
    const post = (debit: number, credit: number) => sql`
      INSERT INTO ledger (ref_type, ref_id, account, debit, credit, currency)
      VALUES ('payment', ${id}, 'treasury', ${debit}, ${credit}, 'AUSD')`;
    expect(await errorOf(post(0, 0))).toMatch(/ledger_check/);
    expect(await errorOf(post(5, 5))).toMatch(/ledger_check/);
    expect(await errorOf(post(-5, 0))).toMatch(/ledger_debit_check/);
  });
});
