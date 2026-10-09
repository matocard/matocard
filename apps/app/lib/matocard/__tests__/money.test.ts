import { expect, test } from "vitest";
import { approxIdr, ausdToIdr, formatAusd, formatBps, formatIdr } from "../money";

test("AUSD and rupiah format the way the screens show them", () => {
  expect(formatAusd(150_000_000n)).toBe("150.00");
  expect(formatAusd(134_529_147n)).toBe("134.52");
  expect(formatAusd(1_234_500_000n)).toBe("1,234.50");
  expect(formatAusd(0n)).toBe("0.00");
  expect(formatIdr(2_400_000n)).toBe("Rp 2,400,000");
});

test("rupiah at the PLAN's rate, rounded down like the backend pays", () => {
  // PLAN §3: 1 USD = 16,000 IDR, so 150 AUSD is Rp 2.4m.
  expect(ausdToIdr(150_000_000n, "16000")).toBe(2_400_000n);
  expect(ausdToIdr(1n, "16000")).toBe(0n);
  expect(approxIdr(100_000_000n, "16250.5")).toBe("≈ Rp 1,625,050");
  expect(approxIdr(undefined, "16000")).toBeNull();
  expect(approxIdr(1n, undefined)).toBeNull();
});

test("the ratio reads as a percentage", () => {
  expect(formatBps(15_000n)).toBe("150%");
  expect(formatBps(11_150n)).toBe("111.5%");
  expect(formatBps(13_810n)).toBe("138.1%");
});

test("ringgit is in sen and reads with two decimals", async () => {
  const { approxLocal, formatLocal, ausdToLocal } = await import("../money");
  expect(formatLocal(60_000n, "MYR")).toBe("RM 600.00");
  // PLAN §3: 1 USD = 4.00 MYR, so 150 AUSD is RM 600 and 100 AUSD is RM 400.
  expect(ausdToLocal(150_000_000n, "MYR", "4")).toBe(60_000n);
  expect(approxLocal(100_000_000n, "4", "MYR")).toBe("≈ RM 400.00");
  expect(approxLocal(100_000_000n, "16000", "IDR")).toBe("≈ Rp 1,600,000");
});

test("a deposit reads back as what was paid in, a limit never more than is there", async () => {
  const { ausdToLocal } = await import("../money");
  // 5.59 USD at 17,889 is Rp 99,999.51.
  expect(ausdToLocal(5_590_000n, "IDR", "17889")).toBe(99_999n);
  expect(ausdToLocal(5_590_000n, "IDR", "17889", "nearest")).toBe(100_000n);
  // Exactly half rounds up; just under rounds down.
  expect(ausdToLocal(500_000n, "IDR", "1", "nearest")).toBe(1n);
  expect(ausdToLocal(499_999n, "IDR", "1", "nearest")).toBe(0n);
});

test("where you live picks the currency, the Xendit account and the minimum", async () => {
  const { localFor } = await import("../local");
  expect(localFor("MY")).toMatchObject({
    currency: "MYR",
    pair: "USD/MYR",
    minTopUp: 500n,
    decimals: 2,
  });
  expect(localFor("ID")).toMatchObject({
    currency: "IDR",
    pair: "USD/IDR",
    minTopUp: 10_000n,
    decimals: 0,
  });
  // Not chosen yet: rupiah, the currency every account can use.
  expect(localFor(null).currency).toBe("IDR");
});

test("dollars round down by default and up for a debt, never to a figure that is not there", async () => {
  const { formatAusd } = await import("../money");
  expect(formatAusd(44_568_245n)).toBe("44.56");
  expect(formatAusd(44_568_245n, "up")).toBe("44.57");
  expect(formatAusd(50_000_000n, "up")).toBe("50.00"); // exact stays exact
  expect(formatAusd(1n)).toBe("0.00");
  expect(formatAusd(1n, "up")).toBe("0.01"); // a speck owed is still owed
});
