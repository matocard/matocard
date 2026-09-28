import type { Entity } from "envio";

export const POOL_ID = "matocard";

/** Globally unique per log, and stable across re-syncs. */
export function logId(chainId: number, txHash: string, logIndex: number): string {
  return `${chainId}-${txHash}-${logIndex}`;
}

export function cycleId(account: string, number: number): string {
  return `${account}-${number}`;
}

/** UTC calendar day, the unit the payments service reconciles by. */
export function dayId(timestamp: bigint): string {
  return new Date(Number(timestamp) * 1000).toISOString().slice(0, 10);
}

export function emptyAccount(id: string, timestamp: bigint): Entity<"Account"> {
  return {
    id,
    identityHash: undefined,
    verifiedAt: undefined,
    score: 0n,
    drawn: 0n,
    pendingShares: 0n,
    pendingUntil: undefined,
    cycleCount: 0,
    repayCount: 0,
    cyclesOpened: 0,
    defaulted: false,
    totalToppedUp: 0n,
    totalDrawn: 0n,
    totalRepaid: 0n,
    totalWrittenOff: 0n,
    firstSeenAt: timestamp,
    lastActiveAt: timestamp,
  };
}

export function emptyPool(): Entity<"Pool"> {
  return {
    id: POOL_ID,
    verifiedAccounts: 0,
    outstanding: 0n,
    lifetimeDrawn: 0n,
    lifetimeRepaid: 0n,
    lifetimeWrittenOff: 0n,
    defaultCount: 0,
    totalToppedUp: 0n,
    lenderDeposits: 0n,
    lenderWithdrawals: 0n,
    seizedRedeemed: 0n,
  };
}

export function emptyDay(id: string): Entity<"DailyTopUp"> {
  return {
    id,
    relayerAssets: 0n,
    relayerCount: 0,
    directAssets: 0n,
    directCount: 0,
    reversedShares: 0n,
  };
}

/** Matches `DepositMethod` in CreditTypes.sol. */
export const DEPOSIT_METHODS = ["Bank", "Card"] as const;
