import { timingSafeEqual } from "node:crypto";

/** An error whose message is safe to show the caller, answered with a 4xx. */
export class UserError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

/** JSON with bigints as decimal strings: amounts never pass through a float. */
export const json = (body: unknown, status = 200) =>
  new Response(
    JSON.stringify(body, (_, v) => (typeof v === "bigint" ? v.toString() : v)),
    {
      status,
      headers: { "content-type": "application/json" },
    },
  );

export const sameSecret = (given: string | null | undefined, expected: string | undefined) => {
  if (!given || !expected) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};

export async function body(req: Request): Promise<Record<string, unknown>> {
  const parsed = await req.json().catch(() => null);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new UserError("body must be a JSON object");
  return parsed as Record<string, unknown>;
}
