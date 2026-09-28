import limits from "./gas-limits.json";

/**
 * Gas limits to send with each call on Monad, which charges for the limit, not
 * for gas used. Each is the largest `eth_estimateGas` Monad returned for that
 * call on testnet (first-time accounts, cycle-closing repayments) plus 25%,
 * rounded up. Sending these skips an estimate round trip per transaction.
 *
 * `markDefaulted` is not listed: it has never run on testnet, so estimate it.
 * `approve` is the AUSD approval before `depositFor`, `repay` or `deposit`.
 */
export const gasLimits: Readonly<Record<keyof typeof limits, bigint>> = Object.fromEntries(
  Object.entries(limits).map(([name, gas]) => [name, BigInt(gas)]),
) as Record<keyof typeof limits, bigint>;
