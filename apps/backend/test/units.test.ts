import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { card, cardNumber, createRoutes } from "../src/api";
import { identityHash } from "../src/kyc";
import { methodOf } from "../src/payments";
import { reconcile } from "../src/reconcile";
import { hasDatabase, testDatabase } from "./harness";

test("the paid channel decides the hold; unknown means card", () => {
  expect(methodOf("CARDS")).toBe("card");
  expect(methodOf("BCA_VIRTUAL_ACCOUNT")).toBe("bank");
  expect(methodOf("QRIS")).toBe("qr");
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

test("openapi.json documents every route", async () => {
  const spec = await Bun.file(`${import.meta.dir}/../openapi.json`).json();
  const documented = Object.keys(spec.paths).map((p) => p.replace(/\{\w+\}/g, ":id"));
  const served = Object.keys(createRoutes({} as never)).filter(
    (p) => p !== "/docs" && p !== "/openapi.json",
  );
  expect(documented.sort()).toEqual(served.sort());
});

test("the card number: 16 digits, private prefix, Luhn-valid, one per wallet", () => {
  const luhn = (n: string) =>
    [...n].reverse().reduce((t, c, i) => {
      const d = Number(c) * (i % 2 ? 2 : 1);
      return t + (d > 9 ? d - 9 : d);
    }, 0) %
      10 ===
    0;
  const a = "0xC0519BE562f0De7E32e9A48e50AdecBAde605aAD";
  const b = "0xc6E0De07b60a412c1bb990B77612754B9254DBDa";
  const n = cardNumber(a, "s");
  expect(n).toMatch(/^9988\d{12}$/);
  expect(luhn(n)).toBe(true);
  expect(luhn(cardNumber(b, "s"))).toBe(true);
  expect(cardNumber(a.toLowerCase() as never, "s")).toBe(n);
  expect(cardNumber(b, "s")).not.toBe(n);
  expect(cardNumber(a, "other")).not.toBe(n);
});

test("the card face: derived per wallet, expiry five years from the account's start", () => {
  const user = (wallet: string) =>
    ({ wallet, holder_name: "Siti", created_at: new Date("2026-10-08T00:00:00Z") }) as never;
  const c = card(user("0xC0519BE562f0De7E32e9A48e50AdecBAde605aAD"), "s");
  expect(c).toMatchObject({ holder: "Siti", expiry: "10/31" });
  expect(c.accountNumber).toMatch(/^\d{12}$/);
  expect(c.cvv).toMatch(/^\d{3}$/);
  expect(card(user("0xC0519BE562f0De7E32e9A48e50AdecBAde605aAD"), "s")).toEqual(c);
  expect(card(user("0xc6E0De07b60a412c1bb990B77612754B9254DBDa"), "s").accountNumber).not.toBe(
    c.accountNumber,
  );
});

test("the Dockerfile copies every workspace's package.json, or the frozen install fails", async () => {
  const root = `${import.meta.dir}/../../..`;
  const dockerfile = await Bun.file(`${import.meta.dir}/../Dockerfile`).text();
  const workspaces = [...new Bun.Glob("{apps,packages}/*/package.json").scanSync(root)];
  expect(workspaces.length).toBeGreaterThan(4);
  for (const manifest of workspaces) {
    if (manifest.startsWith("packages/tsconfig")) continue; // copied whole
    expect(dockerfile).toContain(`COPY ${manifest} `);
  }
});
