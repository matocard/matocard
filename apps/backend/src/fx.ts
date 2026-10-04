import type { SQL } from "bun";
import { UserError } from "./http";

/** Pairs the app quotes: AUSD counts as USD. Rate = units of the second per one USD. */
export const PAIRS = ["USD/MYR", "USD/IDR"] as const;
export type Pair = (typeof PAIRS)[number];
export const isPair = (pair: unknown): pair is Pair => PAIRS.includes(pair as Pair);

const QUOTE_TTL_SECONDS = 60;

// ponytail: free ECB rates via Frankfurter, fine for a demo (PLAN §7.4); production takes the partner's rate
async function fetchRate(pair: Pair): Promise<string> {
  const [base, quote] = pair.split("/");
  const res = await fetch(`https://api.frankfurter.dev/v1/latest?base=${base}&symbols=${quote}`);
  if (!res.ok) throw new Error(`FX source answered ${res.status}`);
  const rate = ((await res.json()) as { rates?: Record<string, number> }).rates?.[quote!];
  if (!rate || rate <= 0) throw new Error(`FX source has no ${pair}`);
  return String(rate);
}

/** FX quotes locked for 60 seconds (D2). */
export function createFx(sql: SQL, source = fetchRate) {
  const cache = new Map<Pair, { rate: string; at: number }>();

  return {
    async quote(pair: Pair) {
      let hit = cache.get(pair);
      if (!hit || Date.now() - hit.at > 60_000) {
        hit = { rate: await source(pair), at: Date.now() };
        cache.set(pair, hit);
      }
      const [row] = await sql`
        INSERT INTO fx_quotes (pair, rate, expires_at)
        VALUES (${pair}, ${hit.rate}, now() + make_interval(secs => ${QUOTE_TTL_SECONDS}))
        RETURNING id, pair, rate::text AS rate, expires_at AS "expiresAt"`;
      return row as { id: string; pair: Pair; rate: string; expiresAt: Date };
    },

    /** An unexpired quote for one of `pairs`, or an error the app can show. */
    async use(
      id: unknown,
      pairs: readonly Pair[] = PAIRS,
    ): Promise<{ id: string; rate: string; pair: Pair }> {
      if (typeof id !== "string" || !/^[0-9a-f-]{36}$/.test(id))
        throw new UserError("quote id missing");
      const [row] = await sql`
        SELECT id, pair, rate::text AS rate, expires_at > now() AS live FROM fx_quotes
        WHERE id = ${id}`;
      if (!row || !pairs.includes(row.pair)) throw new UserError("unknown quote");
      if (!row.live) throw new UserError("quote expired, ask for a new one");
      return { id: row.id, rate: row.rate, pair: row.pair };
    },
  };
}

export type Fx = ReturnType<typeof createFx>;
