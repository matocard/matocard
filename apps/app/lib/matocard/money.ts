import { baseToQuote, formatAmount } from "@matocard/core";

/**
 * Money on screen. Every amount is a bigint in its smallest unit (AUSD: 6 decimals, IDR: whole
 * rupiah) and is never turned into a float. Rupiah figures are what the backend would charge or
 * pay at the same rate (`baseToQuote` from `@matocard/core`), shown with "≈" because the rate is a
 * quote, not a promise.
 */

/** 150_000_000n → "150.00". */
export const formatAusd = (amount: bigint) => groupThousands(formatAmount(amount, "AUSD"));

/** 2_400_000n → "Rp 2,400,000". */
export const formatIdr = (rupiah: bigint) => `Rp ${groupThousands(rupiah.toString())}`;

/** AUSD at a `USD/IDR` rate ("16250.5") as whole rupiah, rounded down. */
export const ausdToIdr = (amount: bigint, rate: string) =>
  baseToQuote(amount, "AUSD", "IDR", rate, "down");

/** "≈ Rp 1,625,050", or null while there is no rate yet (show nothing rather than a guess). */
export function approxIdr(amount: bigint | undefined, rate: string | undefined): string | null {
  if (amount === undefined || !rate) return null;
  return `≈ ${formatIdr(ausdToIdr(amount, rate))}`;
}

/** Bps as a percentage with up to two decimals: 11150n → "111.5%". */
export const formatBps = (bps: bigint) =>
  `${(Number(bps) / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}%`;

function groupThousands(text: string): string {
  const [whole, fraction] = text.split(".");
  const grouped = (whole ?? "").replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return fraction === undefined ? grouped : `${grouped}.${fraction}`;
}
