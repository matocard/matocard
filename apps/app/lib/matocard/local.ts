import type { Pair } from "./backend";
import type { LocalCurrency } from "./money";

/**
 * The money a user pays in, from where they live (`user.country`, chosen at onboarding).
 * Malaysia pays in ringgit through the Malaysian Xendit account (FPX, DuitNow, Malaysian cards);
 * everyone else in rupiah through the Indonesian one (#79). Cash-outs are always rupiah, since
 * the family's bank is Indonesian.
 */
export type Local = {
  currency: LocalCurrency;
  pair: Pair;
  /** The backend's smallest top-up, in the currency's smallest unit. */
  minTopUp: bigint;
  /** Digits after the point when typing an amount (sen for MYR, none for rupiah). */
  decimals: number;
  symbol: "RM" | "Rp";
  methods: { bank: string; qr: string; card: string };
};

const MALAYSIA: Local = {
  currency: "MYR",
  pair: "USD/MYR",
  minTopUp: 500n,
  decimals: 2,
  symbol: "RM",
  methods: { bank: "FPX", qr: "DuitNow QR", card: "Card" },
};

const INDONESIA: Local = {
  currency: "IDR",
  pair: "USD/IDR",
  minTopUp: 10_000n,
  decimals: 0,
  symbol: "Rp",
  methods: { bank: "Bank transfer", qr: "QRIS", card: "Card" },
};

export const localFor = (country: string | null | undefined): Local =>
  country === "MY" ? MALAYSIA : INDONESIA;

/** Countries offered at onboarding: where the senders are and where the families are (PLAN §2.1). */
export const COUNTRIES = [
  { code: "MY", name: "Malaysia" },
  { code: "ID", name: "Indonesia" },
] as const;
