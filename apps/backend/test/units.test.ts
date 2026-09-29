import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { identityHash } from "../src/kyc";
import { methodOf } from "../src/payments";
import { reconcile } from "../src/reconcile";
import { hasDatabase, testDatabase } from "./harness";

test("the paid channel decides the hold; unknown means card", () => {
  expect(methodOf("CARDS")).toBe("card");
  expect(methodOf("MAYB2U_FPX")).toBe("bank");
  expect(methodOf("CIMB_FPX_BUSINESS")).toBe("bank");
  expect(methodOf("DUITNOW_PAY")).toBe("bank");
  expect(methodOf("DUITNOW_QR")).toBe("qr");
  expect(methodOf("SOMETHING_NEW")).toBe("card");
  expect(methodOf(undefined)).toBe("card");
});

test("identity hash: one per document however it is typed, keyed by the salt", () => {
  const doc = { issuing_state: "IDN", document_type: "Passport", document_number: "A1234567" };
  const same = { issuing_state: "idn", document_type: "PASSPORT", document_number: "a 1234-567" };
  expect(identityHash("s", doc)).toBe(identityHash("s", same));
  expect(identityHash("s", doc)).not.toBe(identityHash("other salt", doc));
  expect(identityHash("s", doc)).not.toBe(
    identityHash("s", { ...doc, document_number: "A1234568" }),
  );
  expect(identityHash("s", doc, "0xabc")).not.toBe(identityHash("s", doc, "0xdef"));
  expect(() => identityHash("s", { ...doc, document_number: "" })).toThrow();
});

describe.skipIf(!hasDatabase)("reconciliation", () => {
  let db: Awaited<ReturnType<typeof testDatabase>>;
  const relayer = "0x00000000000000000000000000000000000000aa";
  const day = new Date().toISOString().slice(0, 10);
  const indexer = (topups: string, count: number, repays: string[]) =>
    (async () => ({
      DailyTopUp_by_pk: { relayerAssets: topups, relayerCount: count },
      Activity: repays.map((amount) => ({ amount })),
    })) as never;

  beforeAll(async () => {
    db = await testDatabase();
    const [u] =
      await db.sql`INSERT INTO users (wallet) VALUES (${`0x${"b".repeat(40)}`}) RETURNING id`;
    for (const [kind, ausd] of [
      ["topup", 150_000_000n],
      ["topup", 25_000_000n],
      ["repay", 50_000_000n],
    ] as const) {
      const [p] = await db.sql`
        INSERT INTO payments (user_id, kind, method, fiat_amount, currency, ausd_amount)
        VALUES (${u.id}, ${kind}, 'bank', 100, 'MYR', ${ausd}) RETURNING id`;
      await db.sql`UPDATE payments SET status = 'PAID' WHERE id = ${p.id}`;
      await db.sql`UPDATE payments SET status = 'CREDITED_ONCHAIN' WHERE id = ${p.id}`;
      if (kind === "repay") {
        await db.sql`INSERT INTO ledger (ref_type, ref_id, account, debit, currency) VALUES
          ('payment', ${p.id}, ${`debt:0x${"b".repeat(40)}`}, 40000000, 'AUSD')`;
      }
    }
  });
  afterAll(() => db?.drop());

  test("a day that matches the chain reconciles", async () => {
    expect(await reconcile(db.sql, indexer("175000000", 2, ["40000000"]), relayer, day)).toEqual(
      [],
    );
  });

  test("any difference is reported, not fixed", async () => {
    const out = await reconcile(db.sql, indexer("150000000", 1, []), relayer, day);
    expect(out).toEqual([
      "top-ups: database 175000000, chain 150000000",
      "top-up count: database 2, chain 1",
      "repayments: database 40000000, chain 0",
    ]);
  });

  test("without an indexer it refuses rather than pretending", async () => {
    expect(reconcile(db.sql, (async () => null) as never, relayer, day)).rejects.toThrow(
      /INDEXER_URL/,
    );
  });
});
