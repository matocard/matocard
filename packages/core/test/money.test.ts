import { expect, test } from "bun:test";
import { baseToQuote, formatAmount, parseAmount, quoteToBase } from "../src";

test("parses into the smallest unit without rounding", () => {
  expect(parseAmount("150", "AUSD")).toBe(150_000_000n);
  expect(parseAmount("108.61", "AUSD")).toBe(108_610_000n);
  expect(parseAmount("0.000001", "AUSD")).toBe(1n);
  expect(parseAmount("600.00", "MYR")).toBe(60_000n);
  expect(parseAmount("800000", "IDR")).toBe(800_000n);
});

test("refuses what is not an exact amount", () => {
  for (const bad of ["", "abc", "-1", "1e3", "1.", ".5", "1,5"]) {
    expect(() => parseAmount(bad, "AUSD")).toThrow();
  }
  expect(() => parseAmount("0.0000001", "AUSD")).toThrow();
  expect(() => parseAmount("1.5", "IDR")).toThrow();
});

test("formats with at least two decimals, and round-trips", () => {
  expect(formatAmount(108_610_000n, "AUSD")).toBe("108.61");
  expect(formatAmount(150_000_000n, "AUSD")).toBe("150.00");
  expect(formatAmount(1n, "AUSD")).toBe("0.000001");
  expect(formatAmount(-5_000_000n, "AUSD")).toBe("-5.00");
  expect(formatAmount(800_000n, "IDR")).toBe("800000");
  for (const text of ["0.00", "129.64", "0.000001", "1234567.123456"]) {
    expect(formatAmount(parseAmount(text, "AUSD"), "AUSD")).toBe(text);
  }
});

test("converts along a quoted pair, rounding the way it is told", () => {
  // Rp 800,000 at 16,000 IDR per USD is exactly 50 AUSD
  expect(quoteToBase(800_000n, "IDR", "AUSD", "16000", "down")).toBe(50_000_000n);
  // RM 600 at 4 MYR per USD is 150 AUSD
  expect(quoteToBase(60_000n, "MYR", "AUSD", "4", "down")).toBe(150_000_000n);
  // 50 AUSD owed at 4.4567 MYR per USD is RM 222.835, charged as RM 222.84
  expect(baseToQuote(50_000_000n, "AUSD", "MYR", "4.4567", "up")).toBe(22_284n);
  expect(baseToQuote(50_000_000n, "AUSD", "MYR", "4.4567", "down")).toBe(22_283n);
  // RM 1 at 3 MYR per USD: 0.333333 credited, 0.333334 if charging
  expect(quoteToBase(100n, "MYR", "AUSD", "3", "down")).toBe(333_333n);
  expect(quoteToBase(100n, "MYR", "AUSD", "3", "up")).toBe(333_334n);
  expect(() => quoteToBase(1n, "MYR", "AUSD", "0", "down")).toThrow();
  expect(() => quoteToBase(1n, "MYR", "AUSD", "-4", "down")).toThrow();
});
