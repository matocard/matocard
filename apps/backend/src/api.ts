import type { SQL } from "bun";
import { type Address, getAddress, isAddress, verifyMessage } from "viem";
import type { Chain } from "./chain";
import { type Fx, isPair } from "./fx";
import { body, json, UserError } from "./http";
import type { Kyc } from "./kyc";
import { type Payments, parseAuthorization } from "./payments";

const MAX_SESSION_SECONDS = 7 * 24 * 3600;
const SENDS_PER_DAY = 50;

/** What the app's passkey account signs once to open a session (Mera signs it without a prompt). */
export const sessionMessage = (wallet: Address, until: number) =>
  `Sign in to Matocard\n${wallet.toLowerCase()}\nuntil ${until}`;

export type User = { id: string; wallet: Address; kyc_status: string; country: string | null };

/**
 * `Authorization: Matocard <wallet>.<until>.<signature>`: the account's own key
 * signed `sessionMessage`, no passwords. Creates the user on first sight.
 */
export async function authenticate(sql: SQL, req: Request): Promise<User> {
  const match = /^Matocard (0x[0-9a-fA-F]{40})\.(\d+)\.(0x[0-9a-fA-F]+)$/.exec(
    req.headers.get("authorization") ?? "",
  );
  if (!match) throw new UserError("sign in first", 401);
  const [, wallet, untilText, signature] = match as unknown as [
    string,
    Address,
    string,
    `0x${string}`,
  ];
  const until = Number(untilText);
  const now = Date.now() / 1000;
  if (until < now || until > now + MAX_SESSION_SECONDS) throw new UserError("session expired", 401);
  const valid = await verifyMessage({
    address: wallet,
    message: sessionMessage(wallet, until),
    signature,
  }).catch(() => false);
  if (!valid) throw new UserError("bad signature", 401);
  const [user] = await sql`
    INSERT INTO users (wallet) VALUES (${wallet.toLowerCase()})
    ON CONFLICT (wallet) DO UPDATE SET wallet = EXCLUDED.wallet
    RETURNING id, wallet, kyc_status, country`;
  return { ...user, wallet: getAddress(user.wallet) } as User;
}

/** Envio's GraphQL, or null when no indexer is configured. */
export function createIndexer(url: string | undefined) {
  return async <T>(query: string, variables: Record<string, unknown>): Promise<T | null> => {
    if (!url) return null;
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query, variables }),
    });
    const out = (await res.json()) as { data?: T; errors?: unknown };
    if (!res.ok || out.errors)
      throw new Error(`indexer: ${JSON.stringify(out.errors ?? res.status)}`);
    return out.data ?? null;
  };
}
export type Indexer = ReturnType<typeof createIndexer>;

/** PLAN §6.3: 150% at score 0 down to 80% at 100. */
const ratioBps = (score: bigint) => 15_000n - (7_000n * score) / 100n;

/** Everything the home screen shows, straight from the contract. */
async function account(chain: Chain, wallet: Address) {
  const r = chain.read;
  const [verified, a, c, value, score, limit, available, balance] = await Promise.all([
    r.isVerified(wallet),
    r.accountOf(wallet),
    r.collateralOf(wallet),
    r.collateralValueOf(wallet),
    r.scoreOf(wallet),
    r.limitOf(wallet),
    r.availableOf(wallet),
    r.ausdBalanceOf(wallet),
  ]);
  const cleared = c.pendingUntil <= BigInt(Math.floor(Date.now() / 1000));
  const principal = c.principal + (cleared ? c.pendingPrincipal : 0n);
  return {
    verified,
    score,
    ratioBps: ratioBps(score),
    limit,
    available,
    drawn: a.drawn,
    dueAt: a.dueAt,
    defaulted: a.defaulted,
    cycles: { counted: a.cycleCount, repaid: a.repayCount },
    collateral: {
      value,
      // net of the yield fee, like the limit
      yield: value > principal ? value - principal : 0n,
      pendingShares: cleared ? 0n : c.pendingShares,
      pendingUntil: cleared ? null : c.pendingUntil,
    },
    balance,
  };
}

const ACTIVITY = `query ($id: String!) {
  Activity(where: { account_id: { _eq: $id } }, order_by: { timestamp: desc }, limit: 100) {
    kind amount shares counterparty method timestamp txHash } }`;

const VERIFY = `query ($id: String!) {
  Account_by_pk(id: $id) { score cycleCount repayCount cyclesOpened defaulted verifiedAt firstSeenAt
    cycles(order_by: { number: asc }) { number outcome openedAt closedAt peakDrawn totalRepaid scoreAfter openTxHash closeTxHash } } }`;

/** One endpoint per screen (#48, PLAN §8). */
export function createRoutes(deps: {
  sql: SQL;
  chain: Chain;
  fx: Fx;
  payments: Payments;
  kyc: Kyc;
  indexer: Indexer;
  wake: () => void;
}) {
  const { sql, chain, fx, payments, kyc, indexer, wake } = deps;
  type Handler = (req: Request & { params: Record<string, string> }) => Promise<Response>;
  const signedIn =
    (handler: (user: User, req: Request) => Promise<unknown>): Handler =>
    async (req) =>
      json(await handler(await authenticate(sql, req), req));

  const routes: Record<string, Partial<Record<"GET" | "POST", Handler>>> = {
    "/health": {
      GET: async () => {
        await sql`SELECT 1`;
        return json({ ok: true });
      },
    },

    "/me": {
      GET: signedIn(async (user) => ({
        user: { wallet: user.wallet, kyc: user.kyc_status, country: user.country },
        ...(await account(chain, user.wallet)),
      })),
    },

    "/me/activity": {
      GET: signedIn(async (user) => {
        const onchain = await indexer<{ Activity: unknown[] }>(ACTIVITY, {
          id: user.wallet.toLowerCase(),
        });
        // money in flight that is not onchain yet
        const payments = await sql`
          SELECT id, kind, method, fiat_amount AS fiat, currency, ausd_amount AS ausd, status, created_at AS "createdAt"
          FROM payments WHERE user_id = ${user.id} AND status IN ('PENDING', 'PAID') ORDER BY created_at DESC`;
        const payouts = await sql`
          SELECT id, kind, fiat_amount AS fiat, currency, ausd_amount AS ausd, status, created_at AS "createdAt"
          FROM payouts WHERE user_id = ${user.id} AND status IN ('PENDING', 'SENT_ONCHAIN') ORDER BY created_at DESC`;
        return { activity: onchain?.Activity ?? [], inFlight: [...payments, ...payouts] };
      }),
    },

    "/quote": {
      POST: async (req) => {
        const { pair } = await body(req);
        if (!isPair(pair)) throw new UserError("pair is USD/MYR or USD/IDR");
        return json(await fx.quote(pair));
      },
    },

    "/verify/:id": {
      // public: no name, no document number, only the record (PLAN §3 step 7)
      GET: async (req) => {
        const id = req.params.id ?? "";
        if (!isAddress(id)) throw new UserError("not an account", 404);
        const wallet = getAddress(id);
        const [score, a, verified] = await Promise.all([
          chain.read.scoreOf(wallet),
          chain.read.accountOf(wallet),
          chain.read.isVerified(wallet),
        ]);
        const history = await indexer<{ Account_by_pk: unknown }>(VERIFY, {
          id: wallet.toLowerCase(),
        });
        return json({
          account: wallet,
          verified,
          score,
          ratioBps: ratioBps(score),
          cycles: { counted: a.cycleCount, repaid: a.repayCount },
          defaulted: a.defaulted,
          history: history?.Account_by_pk ?? null,
        });
      },
    },

    "/kyc/session": { POST: signedIn((user) => kyc.start(user)) },

    "/topups": {
      POST: signedIn(async (user, req) => {
        if (user.kyc_status !== "approved") throw new UserError("verify your identity first", 403);
        return payments.topup(user, await body(req));
      }),
    },

    "/settlements": { POST: signedIn(async (user, req) => payments.settle(user, await body(req))) },

    "/cashouts": {
      POST: signedIn(async (user, req) => {
        const out = await payments.cashout(user, await body(req));
        wake();
        return out;
      }),
    },

    "/sends": {
      // D11: the sender signs an ERC-3009 transfer, the relayer pays the gas
      POST: signedIn(async (user, req) => {
        if (user.kyc_status !== "approved") throw new UserError("verify your identity first", 403);
        const auth = parseAuthorization((await body(req)).authorization);
        if (auth.from !== user.wallet)
          throw new UserError("authorization is not from this account");
        // the relayer pays these, so they are capped like everything else it sends
        const [today] = await sql`
          SELECT count(*)::int AS n FROM relayer_txs
          WHERE kind = 'transferWithAuthorization' AND wallet = ${user.wallet.toLowerCase()}
            AND created_at >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`;
        if (today.n >= SENDS_PER_DAY) throw new UserError("daily send limit reached", 429);
        return chain.transferWithAuthorization(auth);
      }),
    },

    "/webhooks/xendit": {
      POST: async (req) => {
        const res = await payments.webhook(req);
        wake();
        return res;
      },
    },

    "/webhooks/didit": {
      POST: async (req) => {
        const res = await kyc.webhook(req);
        wake();
        return res;
      },
    },
  };

  // one error shape for every route; anything unexpected is logged, not shown
  for (const methods of Object.values(routes)) {
    for (const [method, handler] of Object.entries(methods) as ["GET" | "POST", Handler][]) {
      methods[method] = async (req) => {
        try {
          return await handler(req);
        } catch (error) {
          if (error instanceof UserError) return json({ error: error.message }, error.status);
          // the relayer's dry run refused it: the request was wrong, the reason is the contract's
          if (error instanceof Error && error.message.includes(" would revert: ")) {
            return json({ error: error.message }, 400);
          }
          console.error(`${method} ${new URL(req.url).pathname}:`, error);
          return json({ error: "something went wrong" }, 500);
        }
      };
    }
  }
  return routes;
}
