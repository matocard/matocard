import { gasLimits, matoCreditLineAbi, monadTestnet, testAusdAbi } from "@matocard/contracts";

/**
 * Matocard's onchain side, from `@matocard/contracts`: the same addresses, ABIs and gas limits
 * the backend and the indexer use, so a redeploy changes one file (`packages/contracts`).
 */

export const MONAD_CHAIN_ID = monadTestnet.chainId;

/** The credit line's proxy. Never the implementation. */
export const CREDIT_LINE = monadTestnet.matoCreditLine;

/** Agora's AUSD, 6 decimals. Collateral, debt and sends are all AUSD (PLAN D1). */
export const AUSD = monadTestnet.ausd;
export const AUSD_DECIMALS = 6;

export const creditLineAbi = matoCreditLineAbi;
/** TestAUSD's ABI has AUSD's `permit` and ERC-3009 selectors, so it serves as AUSD's ABI. */
export const ausdAbi = testAusdAbi;

/** Monad charges the gas limit, not gas used: send these instead of estimating. */
export { gasLimits };

const EXPLORER = "https://testnet.monadvision.com";

export const explorerTx = (hash: string) => `${EXPLORER}/tx/${hash}`;
export const explorerAddress = (address: string) => `${EXPLORER}/address/${address}`;

/**
 * Collateral needed per unit of credit at a score, in bps (PLAN §6.3): 150% at score 0, falling
 * linearly to 80% at 100. Mirrors `CreditScoring.ratioBps`, integer maths and all, so the
 * breakdown on screen is the contract's own figure.
 */
export function ratioBps(score: bigint): bigint {
  const bounded = score > 100n ? 100n : score;
  return 15_000n - (7_000n * bounded) / 100n;
}

/** The limit a collateral value supports at a score, rounded down like `CreditScoring.limit`. */
export function limitFor(collateralValue: bigint, score: bigint): bigint {
  return (collateralValue * 10_000n) / ratioBps(score);
}
