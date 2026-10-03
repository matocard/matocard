import { baseToQuote, formatAmount, parseAmount, quoteToBase } from "@matocard/core";
import type { SQL } from "bun";
import { type Address, getAddress, type Hex, isAddress, isHex } from "viem";
import type { Authorization, Chain } from "./chain";
import type { Config } from "./config";
import { once, post } from "./db";
import type { Fx } from "./fx";
import { sameSecret, UserError } from "./http";

const XENDIT = "https://api.xendit.co";
// ponytail: one Indonesian Xendit account collects and pays out. Collecting MYR needs a
// Malaysian account (country of origin); switch these three back when there is one
const COLLECT = { currency: "IDR", country: "ID", pair: "USD/IDR" } as const;

type User = { id: string; wallet: Address };

// rows as Bun.sql returns them: int8 as bigint (see db.ts), numeric as string
type PaymentRow = {
  id: string;
  kind: "topup" | "repay";
  method: string;
  status: string;
  wallet: string;
  ausd_amount: bigint;
  fiat_amount: bigint;
  currency: string;
  shares: string | null;
  settles_at: Date | null;
};
type PayoutRow = {
  id: string;
  status: string;
  wallet: string;
  ausd_amount: bigint;
  fiat_amount: bigint;
  currency: string;
  recipient_json: {
    bank: { channelCode: string; accountNumber: string; accountHolderName: string };
    authorization: unknown;
  };
};

async function xendit(
  key: string | undefined,
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
) {
  if (!key) throw new UserError("Xendit is not configured on this server", 503);
  const res = await fetch(`${XENDIT}${path}`, {
    method: "POST",
    headers: {
      authorization: `Basic ${btoa(`${key}:`)}`,
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Xendit ${path} answered ${res.status}: ${text}`);
  return JSON.parse(text) as Record<string, unknown>;
}

/**
 * How a payment was actually made, from the channel Xendit reports. The hold
 * follows this, not what the app asked for (D5). Anything unrecognised is
 * treated as a card: the longest hold is the safe default.
 */
export function methodOf(channelCode: unknown): "card" | "bank" | "qr" {
  const code = String(channelCode ?? "").toUpperCase();
  if (
    code.endsWith("_VIRTUAL_ACCOUNT") ||
    code.endsWith("_FPX") ||
    code.endsWith("_FPX_BUSINESS") ||
    code === "DUITNOW_PAY"
  )
    return "bank";
  if (code.includes("QR")) return "qr";
  return "card";
}

/** Parses an ERC-3009 authorization from a request body. */
export function parseAuthorization(value: unknown): Authorization {
  const a = (value ?? {}) as Record<string, unknown>;
  const big = (v: unknown) => {
    if (typeof v !== "string" && typeof v !== "number")
      throw new UserError("authorization is malformed");
    return BigInt(v);
  };
  if (!isAddress(String(a.from)) || !isAddress(String(a.to)))
    throw new UserError("authorization is malformed");
  if (!isHex(a.nonce) || a.nonce.length !== 66 || !isHex(a.signature))
    throw new UserError("authorization is malformed");
  return {
    from: getAddress(String(a.from)),
    to: getAddress(String(a.to)),
    value: big(a.value),
    validAfter: big(a.validAfter),
    validBefore: big(a.validBefore),
    nonce: a.nonce as Hex,
    signature: a.signature as Hex,
  };
}

/**
 * Xendit money in and out (PLAN §7.1, §7.2). Webhooks only record what
 * happened; `work()` does the onchain part, so a slow chain never times out a
 * webhook and a crash leaves a PAID payment that the next run picks up.
 */
export function createPayments(sql: SQL, chain: Chain, fx: Fx, config: Config) {
  const { xendit: x } = config;

  async function checkout(
    user: User,
    kind: "topup" | "repay",
    method: string,
    fiat: bigint,
    ausd: bigint,
    quoteId: string,
  ) {
    const [payment] = await sql`
      INSERT INTO payments (user_id, kind, method, fiat_amount, currency, quote_id, ausd_amount)
      VALUES (${user.id}, ${kind}, ${method}, ${fiat}, ${COLLECT.currency}, ${quoteId}, ${ausd})
      RETURNING id`;
    const session = await xendit(x.secretKey, "/sessions", {
      reference_id: payment.id,
      session_type: "PAY",
      mode: "PAYMENT_LINK",
      amount: Number(formatAmount(fiat, COLLECT.currency)),
      currency: COLLECT.currency,
      country: COLLECT.country,
      ...(method === "card" ? { allowed_payment_channels: ["CARDS"] } : {}),
      ...(x.returnUrl ? { success_return_url: x.returnUrl, cancel_return_url: x.returnUrl } : {}),
    });
    await sql`UPDATE payments SET provider_session_id = ${String(session.payment_session_id)},
              checkout_url = ${String(session.payment_link_url)} WHERE id = ${payment.id}`;
    return {
      paymentId: payment.id as string,
      checkoutUrl: String(session.payment_link_url),
      fiat,
      ausd,
    };
  }

  async function paid(reference: unknown, paymentId: unknown, channel: unknown) {
    if (typeof reference !== "string" || !/^[0-9a-f-]{36}$/.test(reference)) return;
    const [row] = await sql`
      UPDATE payments SET status = 'PAID', provider_event_id = ${String(paymentId ?? reference)},
        channel_code = ${channel ? String(channel) : null}, method = ${methodOf(channel)}
      WHERE id = ${reference} AND status = 'PENDING'
      RETURNING id, fiat_amount, currency`;
    if (row)
      await post(
        sql,
        { type: "payment", id: row.id },
        "fx",
        "xendit",
        row.fiat_amount,
        row.currency,
      );
  }

  async function failed(reference: unknown) {
    if (typeof reference !== "string" || !/^[0-9a-f-]{36}$/.test(reference)) return;
    await sql`UPDATE payments SET status = 'FAILED' WHERE id = ${reference} AND status = 'PENDING'`;
  }

  /** A refund or chargeback: remember it; `work()` reverses what it still can. */
  async function reversed(paymentId: unknown) {
    if (!paymentId) return;
    await sql`UPDATE payments SET chargeback = 'received'
              WHERE provider_event_id = ${String(paymentId)} AND kind = 'topup'
                AND status IN ('PAID', 'CREDITED_ONCHAIN', 'SETTLED') AND chargeback IS NULL`;
  }

  async function payoutResult(event: string, data: Record<string, unknown>) {
    const id = String(data.reference_id ?? "");
    if (!/^[0-9a-f-]{36}$/.test(id)) return;
    if (event === "payout.succeeded") {
      const [row] = await sql`UPDATE payouts SET status = 'DISBURSED'
        WHERE id = ${id} AND status = 'SENT_ONCHAIN' RETURNING id, fiat_amount, currency`;
      if (row)
        await post(sql, { type: "payout", id }, "xendit", "fx", row.fiat_amount, row.currency);
    } else {
      // failed or reversed after the AUSD already reached the treasury: a person refunds it
      await sql`UPDATE payouts SET status = 'FAILED', failure = ${String(data.failure_code ?? event)}
        WHERE id = ${id} AND status IN ('SENT_ONCHAIN', 'DISBURSED')`;
      console.error(`payout ${id} ${event}: AUSD is in the treasury, refund by hand`);
    }
  }

  /** Nothing already sent for `ref` may be sent again (rule 7). */
  async function clearToSend(ref: string) {
    const attempts = await chain.attempts(ref);
    if (attempts.some((a) => a.status !== "failed")) {
      console.error(
        `${ref}: an earlier transaction is ${attempts.at(-1)?.status}; check it by hand`,
      );
      return false;
    }
    return attempts.length < 3;
  }

  async function credit(p: PaymentRow) {
    if (!(await clearToSend(p.id))) return;
    const wallet = getAddress(p.wallet);
    if (p.kind === "topup") {
      const r = await chain.depositFor(
        wallet,
        BigInt(p.ausd_amount),
        p.method === "card" ? "card" : "bank",
        p.id,
      );
      await sql`UPDATE payments SET status = 'CREDITED_ONCHAIN', tx_hash = ${r.hash}, shares = ${r.shares},
                settles_at = to_timestamp(${Number(r.countsFrom)}) WHERE id = ${p.id}`;
      await post(
        sql,
        { type: "payment", id: p.id },
        "treasury",
        `collateral:${p.wallet}`,
        BigInt(p.ausd_amount),
        "AUSD",
      );
    } else {
      const r = await chain.repayFor(wallet, BigInt(p.ausd_amount), p.id);
      await sql`UPDATE payments SET status = 'CREDITED_ONCHAIN', tx_hash = ${r.hash}, settles_at = now()
                WHERE id = ${p.id}`;
      await post(
        sql,
        { type: "payment", id: p.id },
        "treasury",
        `debt:${p.wallet}`,
        r.repaid,
        "AUSD",
      );
      // paid more than was owed by the time it landed: owed back to the user
      await post(
        sql,
        { type: "payment", id: p.id },
        "treasury",
        `refund:${p.wallet}`,
        BigInt(p.ausd_amount) - r.repaid,
        "AUSD",
      );
    }
  }

  async function reverse(p: PaymentRow) {
    const ref = { type: "payment" as const, id: p.id };
    const inHold =
      p.status === "PAID" ||
      (p.status === "CREDITED_ONCHAIN" && p.settles_at !== null && p.settles_at > new Date());
    if (!inHold) {
      // after the hold nothing can be taken back onchain: an operator loss (R1)
      await post(sql, ref, "xendit", "loss:chargeback", BigInt(p.fiat_amount), p.currency);
      await sql`UPDATE payments SET chargeback = 'lost' WHERE id = ${p.id}`;
      console.error(`payment ${p.id}: chargeback after the hold, operator loss`);
      return;
    }
    if (p.status === "CREDITED_ONCHAIN") {
      const { pendingShares } = await chain.read.collateralOf(getAddress(p.wallet));
      const credited = BigInt(p.shares ?? 0);
      const shares = credited < pendingShares ? credited : pendingShares;
      if (shares > 0n) await chain.cancelPending(getAddress(p.wallet), shares, p.id);
      await post(sql, ref, `collateral:${p.wallet}`, "treasury", BigInt(p.ausd_amount), "AUSD");
    }
    await sql`UPDATE payments SET status = 'REVERSED', chargeback = 'reversed' WHERE id = ${p.id}`;
    await post(sql, ref, "xendit", "fx", BigInt(p.fiat_amount), p.currency);
  }

  async function disburse(p: PayoutRow) {
    if (p.status === "PENDING") {
      if (!(await clearToSend(p.id))) return;
      const auth = parseAuthorization(p.recipient_json.authorization);
      const { hash } = await chain.transferWithAuthorization(auth, p.id);
      await sql`UPDATE payouts SET status = 'SENT_ONCHAIN', onchain_tx_hash = ${hash} WHERE id = ${p.id}`;
      await post(
        sql,
        { type: "payout", id: p.id },
        `wallet:${p.wallet}`,
        "treasury",
        BigInt(p.ausd_amount),
        "AUSD",
      );
    }
    // the idempotency key makes a retry after a lost answer return the same payout
    const bank = p.recipient_json.bank;
    const res = await xendit(
      x.payoutSecretKey,
      "/v2/payouts",
      {
        reference_id: p.id,
        channel_code: bank.channelCode,
        channel_properties: {
          account_holder_name: bank.accountHolderName,
          account_number: bank.accountNumber,
        },
        amount: Number(p.fiat_amount),
        currency: p.currency,
        description: "Matocard cash out",
      },
      { "idempotency-key": p.id },
    );
    await sql`UPDATE payouts SET provider_disbursement_id = ${String(res.id)} WHERE id = ${p.id}`;
  }

  return {
    /** Top-up (#44): local amount at a locked rate, then Xendit's hosted checkout. */
    async topup(user: User, input: Record<string, unknown>) {
      const method = input.method;
      if (method !== "card" && method !== "bank" && method !== "qr")
        throw new UserError("method is card, bank or qr");
      const quote = await fx.use(input.quoteId, COLLECT.pair);
      let fiat: bigint;
      try {
        fiat = parseAmount(String(input.amount ?? ""), COLLECT.currency);
      } catch {
        throw new UserError(`amount is not a ${COLLECT.currency} amount`);
      }
      if (fiat < 10_000n) throw new UserError("the smallest top-up is Rp 10,000");
      const ausd = quoteToBase(fiat, COLLECT.currency, "AUSD", quote.rate, "down");
      return checkout(user, "topup", method, fiat, ausd, quote.id);
    },

    /** Settlement (#45): the whole debt, charged in local money rounded up. */
    async settle(user: User, input: Record<string, unknown>) {
      const quote = await fx.use(input.quoteId, COLLECT.pair);
      const { drawn } = await chain.read.accountOf(user.wallet);
      if (drawn === 0n) throw new UserError("nothing is owed");
      const fiat = baseToQuote(drawn, "AUSD", COLLECT.currency, quote.rate, "up");
      return checkout(user, "repay", "bank", fiat, drawn, quote.id);
    },

    /** Cash out (#46): the user signs AUSD to the treasury, then Xendit pays IDR to their bank. */
    async cashout(user: User, input: Record<string, unknown>) {
      const quote = await fx.use(input.quoteId, "USD/IDR");
      const auth = parseAuthorization(input.authorization);
      if (auth.from !== getAddress(user.wallet))
        throw new UserError("authorization is not from this account");
      if (auth.to !== chain.relayer) throw new UserError("authorization must pay the treasury");
      if (auth.validBefore < BigInt(Math.floor(Date.now() / 1000) + 300))
        throw new UserError("authorization expires too soon");
      const bank = (input.bank ?? {}) as Record<string, unknown>;
      const account = String(bank.accountNumber ?? "");
      if (
        !/^[A-Z]+_[A-Z0-9_]+$/.test(String(bank.channelCode)) ||
        !/^\d{6,20}$/.test(account) ||
        !bank.accountHolderName
      ) {
        throw new UserError("bank needs channelCode, accountNumber and accountHolderName");
      }
      const fiat = baseToQuote(auth.value, "AUSD", "IDR", quote.rate, "down");
      if (fiat < 10_000n) throw new UserError("the smallest cash out is Rp 10,000");
      const recipient = {
        bank: {
          channelCode: bank.channelCode,
          accountNumber: account,
          accountHolderName: String(bank.accountHolderName),
        },
        authorization: {
          ...auth,
          value: String(auth.value),
          validAfter: String(auth.validAfter),
          validBefore: String(auth.validBefore),
        },
      };
      const [row] = await sql`
        INSERT INTO payouts (user_id, kind, recipient_json, ausd_amount, fiat_amount, currency, quote_id)
        VALUES (${user.id}, 'cashout', ${recipient}, ${auth.value}, ${fiat}, 'IDR', ${quote.id})
        RETURNING id`;
      return { payoutId: row.id as string, ausd: auth.value, fiat };
    },

    /** Every Xendit webhook: payments, refunds, disputes and payouts. */
    async webhook(req: Request): Promise<Response> {
      const token = req.headers.get("x-callback-token");
      if (!sameSecret(token, x.callbackToken) && !sameSecret(token, x.payoutCallbackToken)) {
        return new Response("bad callback token", { status: 401 });
      }
      const payload = (await req.json().catch(() => null)) as {
        event?: string;
        data?: Record<string, unknown>;
      } | null;
      if (!payload?.event || !payload.data) return new Response("ignored");
      const { event, data } = payload;
      const delivery =
        req.headers.get("webhook-id") ??
        `${event}:${data.payment_id ?? data.payment_session_id ?? data.id}`;
      const handled = await once(sql, "xendit", delivery, async () => {
        if (
          event === "payment_session.completed" ||
          event === "payment.capture" ||
          event === "payment.succeeded"
        ) {
          await paid(data.reference_id, data.payment_id, data.channel_code);
        } else if (
          event === "payment_session.expired" ||
          event === "payment.failure" ||
          event === "payment.expiry"
        ) {
          await failed(data.reference_id);
        } else if (event === "refund.succeeded" || event.startsWith("dispute.")) {
          if (event !== "dispute.won")
            await reversed(data.payment_id ?? (payload as Record<string, unknown>).payment_id);
        } else if (event.startsWith("payout.")) {
          await payoutResult(event, data);
        }
      });
      if (!handled) return new Response("duplicate");
      return new Response("ok");
    },

    /** The onchain half: credit what is paid, reverse chargebacks, settle holds, send payouts. */
    async work() {
      const charged = await sql`
        SELECT p.*, u.wallet FROM payments p JOIN users u ON u.id = p.user_id
        WHERE p.chargeback = 'received'`;
      for (const p of charged) await each(`reverse ${p.id}`, () => reverse(p));

      const due = await sql`
        SELECT p.*, u.wallet FROM payments p JOIN users u ON u.id = p.user_id
        WHERE p.status = 'PAID' AND p.chargeback IS NULL ORDER BY p.created_at`;
      for (const p of due) await each(`credit ${p.id}`, () => credit(p));

      await sql`UPDATE payments SET status = 'SETTLED'
                WHERE status = 'CREDITED_ONCHAIN' AND settles_at <= now() AND chargeback IS NULL`;

      const payouts = await sql`
        SELECT o.*, u.wallet FROM payouts o JOIN users u ON u.id = o.user_id
        WHERE o.status = 'PENDING' OR (o.status = 'SENT_ONCHAIN' AND o.provider_disbursement_id IS NULL)
        ORDER BY o.created_at`;
      for (const p of payouts) await each(`payout ${p.id}`, () => disburse(p));
    },
  };
}

async function each(what: string, job: () => Promise<unknown>) {
  try {
    await job();
  } catch (error) {
    console.error(`${what} failed:`, error instanceof Error ? error.message : error);
  }
}

export type Payments = ReturnType<typeof createPayments>;
