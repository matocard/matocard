// Every amount is a bigint in its currency's smallest unit: AUSD has 6 decimals
// onchain, IDR has none at Xendit. No floats anywhere money is counted.
export const DECIMALS = { AUSD: 6, USD: 2, MYR: 2, IDR: 0 } as const;
export type Currency = keyof typeof DECIMALS;

/** "12.5" → 12_500_000n for AUSD. Refuses more decimals than the currency has, never rounds. */
export function parseAmount(text: string, currency: Currency): bigint {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(text.trim());
  if (!match) throw new Error(`not an amount: "${text}"`);
  const decimals = DECIMALS[currency];
  const fraction = match[2] ?? "";
  if (fraction.length > decimals) {
    throw new Error(`${currency} has ${decimals} decimals, got "${text}"`);
  }
  return BigInt(match[1] + fraction.padEnd(decimals, "0"));
}

/** 12_500_000n → "12.50" for AUSD: all decimals up to the second, trailing zeros past it dropped. */
export function formatAmount(amount: bigint, currency: Currency): string {
  const decimals = DECIMALS[currency];
  const sign = amount < 0n ? "-" : "";
  const digits = (amount < 0n ? -amount : amount).toString().padStart(decimals + 1, "0");
  const whole = digits.slice(0, digits.length - decimals);
  const fraction = digits
    .slice(digits.length - decimals)
    .replace(/0+$/, "")
    .padEnd(Math.min(2, decimals), "0");
  return fraction ? `${sign}${whole}.${fraction}` : `${sign}${whole}`;
}

const RATE_SCALE = 10n ** 18n;
export type Rounding = "down" | "up";

/** A decimal rate such as "4.4567" as a bigint scaled by 1e18, refusing zero and garbage. */
function scaleRate(rate: string): bigint {
  const match = /^(\d+)(?:\.(\d{1,18}))?$/.exec(rate.trim());
  if (!match) throw new Error(`not a rate: "${rate}"`);
  const scaled = BigInt(match[1] + (match[2] ?? "").padEnd(18, "0"));
  if (scaled === 0n) throw new Error("rate is zero");
  return scaled;
}

function mulDiv(a: bigint, b: bigint, d: bigint, rounding: Rounding): bigint {
  const q = (a * b) / d;
  return rounding === "up" && q * d < a * b ? q + 1n : q;
}

/**
 * A quoted pair BASE/QUOTE with `rate` units of QUOTE per one BASE, e.g.
 * USD/MYR at "4.45". AUSD counts as USD. Round "down" for what the user
 * receives, "up" for what the user is charged.
 */
export function baseToQuote(
  amount: bigint,
  base: Currency,
  quote: Currency,
  rate: string,
  rounding: Rounding,
) {
  return mulDiv(
    amount,
    scaleRate(rate) * 10n ** BigInt(DECIMALS[quote]),
    RATE_SCALE * 10n ** BigInt(DECIMALS[base]),
    rounding,
  );
}

export function quoteToBase(
  amount: bigint,
  quote: Currency,
  base: Currency,
  rate: string,
  rounding: Rounding,
) {
  return mulDiv(
    amount,
    RATE_SCALE * 10n ** BigInt(DECIMALS[base]),
    scaleRate(rate) * 10n ** BigInt(DECIMALS[quote]),
    rounding,
  );
}
