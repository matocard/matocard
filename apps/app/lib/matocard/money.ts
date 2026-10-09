import { baseToQuote, formatAmount } from "@matocard/core";

/**
 * Money on screen. Every amount is a bigint in its smallest unit (AUSD: 6 decimals, IDR: whole
 * rupiah) and is never turned into a float. Rupiah figures are what the backend would charge or
 * pay at the same rate (`baseToQuote` from `@matocard/core`), shown with "≈" because the rate is a
 * quote, not a promise.
 */

/**
 * Dollars on screen, always two decimals: 134_529_147n → "134.52". AUSD carries six, which reads
 * as noise to someone checking what they can spend. Rounded down by default, so a balance or a
 * limit never shows more than is there; pass "up" for what someone owes, so a debt never shows
 * less. Transactions always use the exact figure from the contract, never this text.
 */
export function formatAusd(amount: bigint, rounding: "down" | "up" = "down"): string {
  const unit = 10_000n; // AUSD's 6 decimals down to cents
  const negative = amount < 0n;
  const abs = negative ? -amount : amount;
  const cents = rounding === "up" ? (abs + unit - 1n) / unit : abs / unit;
  const text = groupThousands(`${cents / 100n}.${(cents % 100n).toString().padStart(2, "0")}`);
  return negative ? `-${text}` : text;
}

/** 2_400_000n → "Rp 2,400,000". */
export const formatIdr = (rupiah: bigint) => `Rp ${groupThousands(rupiah.toString())}`;

/** AUSD at a `USD/IDR` rate ("16250.5") as whole rupiah, rounded down. */
export const ausdToIdr = (amount: bigint, rate: string) =>
  baseToQuote(amount, "AUSD", "IDR", rate, "down");

/** 60_000n sen → "RM 600.00". */
export const formatMyr = (sen: bigint) => `RM ${groupThousands(formatAmount(sen, "MYR"))}`;

/** The money a user pays in and thinks in. */
export type LocalCurrency = "IDR" | "MYR";

/** An amount in `currency`'s smallest unit (rupiah, sen), with its symbol. */
export const formatLocal = (amount: bigint, currency: LocalCurrency) =>
  currency === "MYR" ? formatMyr(amount) : formatIdr(amount);

/**
 * AUSD at a `USD/<currency>` rate, in that currency's smallest unit. Rounded down by default, so
 * what can be spent never shows more than is there. "nearest" is for money someone put in: a
 * Rp 100,000 top-up held as AUSD reads back as Rp 100,000, not Rp 99,999.
 */
export const ausdToLocal = (
  amount: bigint,
  currency: LocalCurrency,
  rate: string,
  rounding: "down" | "nearest" = "down",
) =>
  rounding === "nearest"
    ? // Twice the amount, rounded down, then halved rounding up: the nearest unit, exactly.
      (baseToQuote(amount * 2n, "AUSD", currency, rate, "down") + 1n) / 2n
    : baseToQuote(amount, "AUSD", currency, rate, "down");

/** "≈ RM 400.00" / "≈ Rp 1,625,050", or null while there is no rate yet (never a guess). */
export function approxLocal(
  amount: bigint | undefined,
  rate: string | undefined,
  currency: LocalCurrency = "IDR",
  rounding: "down" | "nearest" = "down",
): string | null {
  if (amount === undefined || !rate) return null;
  return `≈ ${formatLocal(ausdToLocal(amount, currency, rate, rounding), currency)}`;
}

/** Rupiah only; `approxLocal` with "IDR". */
export const approxIdr = (amount: bigint | undefined, rate: string | undefined) =>
  approxLocal(amount, rate, "IDR");

/** Bps as a percentage with up to two decimals: 11150n → "111.5%". */
export const formatBps = (bps: bigint) =>
  `${(Number(bps) / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}%`;

function groupThousands(text: string): string {
  const [whole, fraction] = text.split(".");
  const grouped = (whole ?? "").replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return fraction === undefined ? grouped : `${grouped}.${fraction}`;
}
