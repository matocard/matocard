import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import { matoCreditLineAbi, testAusdAbi } from "@matocard/contracts";
import { createPublicClient, createWalletClient, type Hex, http, keccak256, toHex } from "viem";
import { generatePrivateKey, type PrivateKeyAccount, privateKeyToAccount } from "viem/accounts";
import { createIndexer, createRoutes, sessionMessage } from "../src/api";
import { type Chain, createChain } from "../src/chain";
import type { Config } from "../src/config";
import { createFx } from "../src/fx";
import { createKyc } from "../src/kyc";
import { createPayments, type Payments } from "../src/payments";
import { DEPLOYER_PK, hasAnvil, hasDatabase, testChain, testConfig, testDatabase } from "./harness";

// The demo script of PLAN §3 over HTTP: sign in, verify, top up, get a limit,
// draw to Mom, settle, Mom cashes out. The chain is anvil with the real
// contracts; Xendit, Didit and the FX source are faked at `fetch`.

let db: Awaited<ReturnType<typeof testDatabase>>;
let anvil: Awaited<ReturnType<typeof testChain>>;
let chain: Chain;
let config: Config;
let payments: Payments;
let work: () => Promise<void>;
let server: ReturnType<typeof Bun.serve>;
const siti = privateKeyToAccount(generatePrivateKey());
const mom = privateKeyToAccount(generatePrivateKey());

// what the fakes saw and will answer
const xenditCalls: { path: string; body: Record<string, unknown>; headers: Headers }[] = [];
const decisions = new Map<string, unknown>();
let diditSessions = 0;
const realFetch = globalThis.fetch;

function fakeFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const url = new URL(input instanceof Request ? input.url : input);
  const reply = (body: unknown) => Promise.resolve(Response.json(body));
  if (url.host === "api.xendit.co") {
    const body = JSON.parse(String(init?.body));
    xenditCalls.push({ path: url.pathname, body, headers: new Headers(init?.headers) });
    if (url.pathname === "/sessions") {
      return reply({
        payment_session_id: `ps-${body.reference_id}`,
        payment_link_url: `https://xen.to/${body.reference_id}`,
      });
    }
    return reply({ id: `disb-${body.reference_id}`, status: "ACCEPTED" });
  }
  if (url.host === "verification.didit.me") {
    if (init?.method === "POST")
      return reply({ session_id: `session-${++diditSessions}`, url: "https://verify.didit.me/x" });
    const id = url.pathname.split("/")[3]!;
    return decisions.has(id)
      ? reply(decisions.get(id))
      : Promise.resolve(new Response("down", { status: 500 }));
  }
  return realFetch(input, init);
}

let base: string;
const auth = async (who: PrivateKeyAccount) => {
  const until = Math.floor(Date.now() / 1000) + 3600;
  return `Matocard ${who.address}.${until}.${await who.signMessage({ message: sessionMessage(who.address, until) })}`;
};
async function call(who: PrivateKeyAccount | null, method: string, path: string, body?: unknown) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(who ? { authorization: await auth(who) } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json().catch(() => null)) as Record<string, any> };
}
const xenditHook = (body: unknown, headers: Record<string, string> = {}) =>
  fetch(`${base}/webhooks/xendit`, {
    method: "POST",
    headers: { "x-callback-token": "xendit-token", ...headers },
    body: JSON.stringify(body),
  });
function diditHook(body: unknown, secret = "didit-secret", at = Math.floor(Date.now() / 1000)) {
  const raw = JSON.stringify(body);
  return fetch(`${base}/webhooks/didit`, {
    method: "POST",
    headers: {
      "x-signature": createHmac("sha256", secret).update(raw).digest("hex"),
      "x-timestamp": String(at),
    },
    body: raw,
  });
}
const approvedDecision = (documentNumber: string) => ({
  status: "Approved",
  id_verifications: [
    {
      status: "Approved",
      issuing_state: "IDN",
      document_type: "Passport",
      document_number: documentNumber,
    },
  ],
});

async function verify(who: PrivateKeyAccount, documentNumber: string) {
  const session = await call(who, "POST", "/kyc/session");
  expect(session.status).toBe(200);
  const id = `session-${diditSessions}`;
  decisions.set(id, approvedDecision(documentNumber));
  expect(
    (
      await diditHook({
        event_id: `evt-${id}`,
        session_id: id,
        status: "Approved",
        environment: "live",
      })
    ).status,
  ).toBe(200);
  await work();
}

async function sendAs(
  who: PrivateKeyAccount,
  request: Parameters<ReturnType<typeof createWalletClient>["writeContract"]>[0],
) {
  const wallet = createWalletClient({ account: who, transport: http(anvil.rpcUrl) });
  const hash = await wallet.writeContract({ ...request, account: who, chain: null } as never);
  await createPublicClient({ transport: http(anvil.rpcUrl) }).waitForTransactionReceipt({ hash });
}

async function signTransfer(from: PrivateKeyAccount, to: Hex, value: bigint, label: string) {
  const message = {
    from: from.address,
    to,
    value,
    validAfter: 0n,
    validBefore: BigInt(Math.floor(Date.now() / 1000) + 3600),
    nonce: keccak256(toHex(label)),
  };
  const signature = await from.signTypedData({
    domain: {
      name: "Test AUSD (no value)",
      version: "1",
      chainId: 31337,
      verifyingContract: anvil.ausd,
    },
    types: {
      TransferWithAuthorization: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "validAfter", type: "uint256" },
        { name: "validBefore", type: "uint256" },
        { name: "nonce", type: "bytes32" },
      ],
    },
    primaryType: "TransferWithAuthorization",
    message,
  });
  return {
    ...message,
    value: String(value),
    validAfter: "0",
    validBefore: String(message.validBefore),
    signature,
  };
}

describe.skipIf(!hasDatabase || !hasAnvil)("the demo, end to end", () => {
  beforeAll(async () => {
    [db, anvil] = await Promise.all([testDatabase(), testChain()]);
    config = testConfig(db, anvil);
    chain = createChain(db.sql, config);
    // 1 USD = 4 MYR = 16,000 IDR, as in PLAN §3
    const fx = createFx(db.sql, async (pair) => (pair === "USD/MYR" ? "4" : "16000"));
    payments = createPayments(db.sql, chain, fx, config);
    const kyc = createKyc(db.sql, chain, config);
    work = async () => {
      await kyc.work();
      await payments.work();
    };
    globalThis.fetch = fakeFetch as typeof fetch;
    server = Bun.serve({
      port: 0,
      routes: createRoutes({
        sql: db.sql,
        chain,
        fx,
        payments,
        kyc,
        indexer: createIndexer(undefined),
        wake: () => {},
      }),
      fetch: () => new Response("not found", { status: 404 }),
    });
    base = `http://127.0.0.1:${server.port}`;
    // the treasury holds AUSD to credit top-ups with
    await sendAs(privateKeyToAccount(DEPLOYER_PK), {
      address: anvil.ausd,
      abi: testAusdAbi,
      functionName: "mint",
      args: [chain.relayer, 10_000_000_000n],
    } as never);
  }, 60_000);

  afterAll(async () => {
    globalThis.fetch = realFetch;
    server?.stop(true);
    anvil?.stop();
    await db?.drop();
  });

  test("nothing personal is reachable without a signature", async () => {
    expect((await call(null, "GET", "/me")).status).toBe(401);
    const forged = await fetch(`${base}/me`, {
      headers: { authorization: (await auth(mom)).replace(mom.address, siti.address) },
    });
    expect(forged.status).toBe(401);
  });

  test("the app on another origin may call it", async () => {
    const pre = await fetch(`${base}/me`, { method: "OPTIONS" });
    expect(pre.status).toBe(204);
    expect(pre.headers.get("access-control-allow-headers")).toContain("authorization");
    const res = await fetch(`${base}/me`);
    expect(res.status).toBe(401);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });

  test("1–2. sign up and verify: identity onchain, MON dripped once", async () => {
    await verify(siti, "A1234567");
    const me = await call(siti, "GET", "/me");
    expect(me.body.user.kyc).toBe("approved");
    expect(me.body.verified).toBe(true);
    await work();
    const drips = await db.sql`SELECT count(*)::int AS n FROM relayer_txs WHERE kind = 'drip'`;
    expect(drips[0].n).toBe(1);
  });

  test("the same document cannot verify a second account", async () => {
    const twin = privateKeyToAccount(generatePrivateKey());
    await verify(twin, "a1234 567"); // same passport, typed differently
    expect((await call(twin, "GET", "/me")).body.user.kyc).toBe("duplicate");
  });

  test("a webhook that fails is handled when the provider retries it", async () => {
    const late = privateKeyToAccount(generatePrivateKey());
    await call(late, "POST", "/kyc/session");
    const id = `session-${diditSessions}`;
    const event = {
      event_id: `evt-${id}`,
      session_id: id,
      status: "Approved",
      environment: "live",
    };
    // Didit's decision endpoint is down: answer 5xx so Didit retries
    expect((await diditHook(event)).status).toBe(500);
    decisions.set(id, approvedDecision("C1111111"));
    expect((await diditHook(event)).status).toBe(200);
    expect((await diditHook(event)).status).toBe(200); // now a duplicate, still fine
    await work();
    expect((await call(late, "GET", "/me")).body.user.kyc).toBe("approved");
  });

  test("Didit webhooks need a valid, fresh signature", async () => {
    const event = { event_id: "x", session_id: "session-1", status: "Declined" };
    expect((await diditHook(event, "wrong")).status).toBe(401);
    expect(
      (await diditHook(event, "didit-secret", Math.floor(Date.now() / 1000) - 600)).status,
    ).toBe(401);
    expect((await call(siti, "GET", "/me")).body.user.kyc).toBe("approved");
  });

  test("3. a card top-up is credited once, as pending collateral, however often Xendit calls", async () => {
    const quote = await call(null, "POST", "/quote", { pair: "USD/IDR" });
    const topup = await call(siti, "POST", "/topups", {
      amount: "2400000",
      method: "card",
      quoteId: quote.body.id,
    });
    expect(topup.status).toBe(200);
    expect(topup.body.ausd).toBe("150000000");
    expect(xenditCalls.at(-1)?.body).toMatchObject({
      amount: 2400000,
      currency: "IDR",
      allowed_payment_channels: ["CARDS"],
    });

    const hook = {
      event: "payment_session.completed",
      data: { reference_id: topup.body.paymentId, payment_id: "py-1", channel_code: "CARDS" },
    };
    expect((await xenditHook(hook, { "x-callback-token": "wrong" })).status).toBe(401);
    await Promise.all([
      xenditHook(hook),
      xenditHook(hook),
      xenditHook({ ...hook, event: "payment.capture" }),
    ]);
    await work();
    await work();

    const me = await call(siti, "GET", "/me");
    expect(BigInt(me.body.collateral.pendingShares)).toBeGreaterThan(0n);
    expect(me.body.limit).toBe("0"); // still in the card hold
    const deposits =
      await db.sql`SELECT count(*)::int AS n FROM relayer_txs WHERE kind = 'depositFor'`;
    expect(deposits[0].n).toBe(1);
    const [p] = await db.sql`SELECT status FROM payments WHERE id = ${topup.body.paymentId}`;
    expect(p.status).toBe("CREDITED_ONCHAIN");
    // booked once: fiat in, AUSD out, two postings each
    const postings =
      await db.sql`SELECT currency FROM ledger WHERE ref_id = ${topup.body.paymentId}`;
    expect(postings.map((r: { currency: string }) => r.currency).sort()).toEqual([
      "AUSD",
      "AUSD",
      "IDR",
      "IDR",
    ]);
  });

  test("a chargeback inside the hold takes the deposit back", async () => {
    await xenditHook({ event: "dispute.action_required", data: { payment_id: "py-1" } });
    await work();
    const me = await call(siti, "GET", "/me");
    expect(me.body.collateral.pendingShares).toBe("0");
    const [p] =
      await db.sql`SELECT status, chargeback FROM payments WHERE provider_event_id = 'py-1'`;
    expect(p).toEqual({ status: "REVERSED", chargeback: "reversed" });
  });

  test("4. a bank top-up counts at once: 150 AUSD at score 0 gives a limit of 100", async () => {
    const quote = await call(null, "POST", "/quote", { pair: "USD/IDR" });
    const topup = await call(siti, "POST", "/topups", {
      amount: "2400000",
      method: "card",
      quoteId: quote.body.id,
    });
    // picked card in the app, paid by virtual account: the channel decides, so no hold
    await xenditHook({
      event: "payment_session.completed",
      data: {
        reference_id: topup.body.paymentId,
        payment_id: "py-2",
        channel_code: "BCA_VIRTUAL_ACCOUNT",
      },
    });
    await work();
    const me = await call(siti, "GET", "/me");
    expect(me.body.limit).toBe("100000000");
    expect(me.body.ratioBps).toBe("15000");
    await Bun.sleep(1100);
    await work();
    const [p] =
      await db.sql`SELECT method, status FROM payments WHERE id = ${topup.body.paymentId}`;
    expect(p).toEqual({ method: "bank", status: "SETTLED" });
  });

  test("an expired quote is refused", async () => {
    const quote = await call(null, "POST", "/quote", { pair: "USD/IDR" });
    await db.sql`UPDATE fx_quotes SET expires_at = now() - interval '1 second' WHERE id = ${quote.body.id}`;
    const topup = await call(siti, "POST", "/topups", {
      amount: "10",
      method: "bank",
      quoteId: quote.body.id,
    });
    expect(topup).toEqual({ status: 400, body: { error: "quote expired, ask for a new one" } });
  });

  test("5–6. draw 50 to Mom, then settle in IDR: debt cleared by the relayer", async () => {
    await sendAs(siti, {
      address: anvil.creditLine,
      abi: matoCreditLineAbi,
      functionName: "draw",
      args: [50_000_000n, mom.address],
    } as never);
    const quote = await call(null, "POST", "/quote", { pair: "USD/IDR" });
    const settle = await call(siti, "POST", "/settlements", { quoteId: quote.body.id });
    expect(settle.body).toMatchObject({ fiat: "800000", ausd: "50000000" }); // Rp 800,000
    await xenditHook({
      event: "payment_session.completed",
      data: {
        reference_id: settle.body.paymentId,
        payment_id: "py-3",
        channel_code: "BRI_VIRTUAL_ACCOUNT",
      },
    });
    await work();
    const me = await call(siti, "GET", "/me");
    expect(me.body.drawn).toBe("0");
    expect(me.body.cycles.counted).toBe("0"); // closed too fast to qualify on a 60 s minimum
  });

  test("Mom sends AUSD with a signature only; the relayer pays the gas", async () => {
    await verify(mom, "B7654321");
    const authorization = await signTransfer(mom, siti.address, 5_000_000n, "send-1");
    const send = await call(mom, "POST", "/sends", { authorization });
    expect(send.status).toBe(200);
    const replay = await call(mom, "POST", "/sends", { authorization });
    expect(replay.status).toBe(400);
    expect(replay.body.error).toMatch(/AuthorizationAlreadyUsed/);
  });

  test("Mom cashes out to her bank: AUSD to the treasury, then IDR via Xendit", async () => {
    const quote = await call(null, "POST", "/quote", { pair: "USD/IDR" });
    const authorization = await signTransfer(mom, chain.relayer, 10_000_000n, "cashout-1");
    const bank = {
      channelCode: "ID_BRI",
      accountNumber: "0123456789012",
      accountHolderName: "Mom",
    };
    const out = await call(mom, "POST", "/cashouts", {
      quoteId: quote.body.id,
      authorization,
      bank,
    });
    expect(out.body.fiat).toBe("160000"); // Rp 160,000
    await work();
    const payout = xenditCalls.find((c) => c.path === "/v2/payouts");
    expect(payout?.body).toMatchObject({
      reference_id: out.body.payoutId,
      channel_code: "ID_BRI",
      amount: 160000,
      currency: "IDR",
    });
    expect(payout?.headers.get("idempotency-key")).toBe(out.body.payoutId);

    await xenditHook({ event: "payout.succeeded", data: { reference_id: out.body.payoutId } });
    const [row] = await db.sql`SELECT status FROM payouts WHERE id = ${out.body.payoutId}`;
    expect(row.status).toBe("DISBURSED");
  });

  test("a cash out signed to anyone but the treasury is refused", async () => {
    const quote = await call(null, "POST", "/quote", { pair: "USD/IDR" });
    const authorization = await signTransfer(mom, siti.address, 10_000_000n, "cashout-2");
    const bank = {
      channelCode: "ID_BRI",
      accountNumber: "0123456789012",
      accountHolderName: "Mom",
    };
    const out = await call(mom, "POST", "/cashouts", {
      quoteId: quote.body.id,
      authorization,
      bank,
    });
    expect(out).toEqual({ status: 400, body: { error: "authorization must pay the treasury" } });
  });

  test("7. /verify is public and shows the record, nothing personal", async () => {
    const v = await call(null, "GET", `/verify/${siti.address}`);
    expect(v.status).toBe(200);
    expect(v.body).toMatchObject({ verified: true, score: "0", ratioBps: "15000" });
    expect(JSON.stringify(v.body)).not.toMatch(/A1234567|Passport|IDN/);
  });

  test("an indexer that is down leaves /verify working from the contract", async () => {
    const routes = createRoutes({
      sql: db.sql,
      chain,
      fx: createFx(db.sql),
      payments,
      kyc: createKyc(db.sql, chain, config),
      indexer: createIndexer("http://127.0.0.1:1/v1/graphql"),
      wake: () => {},
    });
    const down = Bun.serve({ port: 0, routes, fetch: () => new Response("", { status: 404 }) });
    const v = await fetch(`http://127.0.0.1:${down.port}/verify/${siti.address}`).then((r) =>
      r.json(),
    );
    down.stop(true);
    expect(v).toMatchObject({ verified: true, history: null, indexer: "unavailable" });
  });

  test("every ledger entry balances, per currency", async () => {
    const rows = await db.sql`
      SELECT currency, sum(debit)::text AS debit, sum(credit)::text AS credit FROM ledger GROUP BY currency`;
    for (const r of rows) expect(r.debit).toBe(r.credit);
    expect(rows.length).toBeGreaterThan(0);
  });
});
