import { expect, test } from "vitest";
import { approxIdr, ausdToIdr, formatAusd, formatBps, formatIdr } from "../money";

test("AUSD and rupiah format the way the screens show them", () => {
  expect(formatAusd(150_000_000n)).toBe("150.00");
  expect(formatAusd(134_529_147n)).toBe("134.529147");
  expect(formatAusd(1_234_500_000n)).toBe("1,234.50");
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
