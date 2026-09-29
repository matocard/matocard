import { expect, test } from "bun:test";
import { formatAmount, parseAmount } from "../src";

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
