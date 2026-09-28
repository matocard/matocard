import { type Entity, type EvmOnEventContext, indexer } from "envio";
import {
  cycleId,
  DEPOSIT_METHODS,
  dayId,
  emptyAccount,
  emptyDay,
  emptyPool,
  logId,
  POOL_ID,
} from "../shared";

type Context = EvmOnEventContext;

/** The parts of an event every handler records. */
type Log = {
  chainId: number;
  logIndex: number;
  block: { number: number; timestamp: number };
  transaction: { hash: string };
};

type ActivityFields = Pick<Entity<"Activity">, "kind"> &
  Partial<Pick<Entity<"Activity">, "amount" | "shares" | "counterparty" | "method">>;

async function loadAccount(context: Context, address: string, log: Log) {
  const id = address.toLowerCase();
  const timestamp = BigInt(log.block.timestamp);
  const account = (await context.Account.get(id)) ?? emptyAccount(id, timestamp);
  return { ...account, lastActiveAt: timestamp };
}

async function loadPool(context: Context) {
  return (await context.Pool.get(POOL_ID)) ?? emptyPool();
}

function recordActivity(context: Context, account: string, log: Log, fields: ActivityFields) {
  context.Activity.set({
    id: logId(log.chainId, log.transaction.hash, log.logIndex),
    account_id: account,
    amount: undefined,
    shares: undefined,
    counterparty: undefined,
    method: undefined,
    ...fields,
    timestamp: BigInt(log.block.timestamp),
    blockNumber: BigInt(log.block.number),
    txHash: log.transaction.hash,
  });
}

function recordScore(
  context: Context,
  account: Entity<"Account">,
  score: bigint,
  reason: Entity<"ScoreChange">["reason"],
  log: Log,
) {
  context.ScoreChange.set({
    id: logId(log.chainId, log.transaction.hash, log.logIndex),
    account_id: account.id,
    reason,
    previous: account.score,
    score,
    timestamp: BigInt(log.block.timestamp),
    txHash: log.transaction.hash,
  });
}

// ---------------------------------------------------------------- identity

indexer.onEvent({ contract: "MatoCreditLine", event: "Verified" }, async ({ event, context }) => {
  const account = await loadAccount(context, event.params.wallet, event);
  context.Account.set({
    ...account,
    identityHash: event.params.identityHash,
    verifiedAt: BigInt(event.block.timestamp),
  });

  const pool = await loadPool(context);
  context.Pool.set({ ...pool, verifiedAccounts: pool.verifiedAccounts + 1 });

  recordActivity(context, account.id, event, { kind: "Verified" });
});

// -------------------------------------------------------------- collateral

indexer.onEvent(
  { contract: "MatoCreditLine", event: "CollateralDeposited" },
  async ({ event, context }) => {
    const { assets, shares, payer, countsFrom } = event.params;
    const method = DEPOSIT_METHODS[Number(event.params.method)] ?? "Bank";
    const account = await loadAccount(context, event.params.account, event);
    const held = countsFrom > BigInt(event.block.timestamp);

    context.Account.set({
      ...account,
      totalToppedUp: account.totalToppedUp + assets,
      pendingShares: held ? account.pendingShares + shares : account.pendingShares,
      pendingUntil: held ? countsFrom : account.pendingUntil,
    });

    const pool = await loadPool(context);
    context.Pool.set({ ...pool, totalToppedUp: pool.totalToppedUp + assets });

    // A relayer top-up is one the payer made for someone else.
    const viaRelayer = payer.toLowerCase() !== account.id;
    const id = dayId(BigInt(event.block.timestamp));
    const day = (await context.DailyTopUp.get(id)) ?? emptyDay(id);
    context.DailyTopUp.set(
      viaRelayer
        ? {
            ...day,
            relayerAssets: day.relayerAssets + assets,
            relayerCount: day.relayerCount + 1,
          }
        : { ...day, directAssets: day.directAssets + assets, directCount: day.directCount + 1 },
    );

    recordActivity(context, account.id, event, {
      kind: "TopUp",
      amount: assets,
      shares,
      counterparty: payer.toLowerCase(),
      method,
    });
  },
);

indexer.onEvent(
  { contract: "MatoCreditLine", event: "PendingSettled" },
  async ({ event, context }) => {
    const account = await loadAccount(context, event.params.account, event);
    // The contract settles every pending share at once.
    context.Account.set({ ...account, pendingShares: 0n, pendingUntil: undefined });
    recordActivity(context, account.id, event, {
      kind: "TopUpCleared",
      shares: event.params.shares,
    });
  },
);

indexer.onEvent(
  { contract: "MatoCreditLine", event: "PendingCancelled" },
  async ({ event, context }) => {
    const { shares } = event.params;
    const account = await loadAccount(context, event.params.account, event);
    const remaining = account.pendingShares > shares ? account.pendingShares - shares : 0n;
    context.Account.set({
      ...account,
      pendingShares: remaining,
      pendingUntil: remaining === 0n ? undefined : account.pendingUntil,
    });

    const id = dayId(BigInt(event.block.timestamp));
    const day = (await context.DailyTopUp.get(id)) ?? emptyDay(id);
    context.DailyTopUp.set({ ...day, reversedShares: day.reversedShares + shares });

    recordActivity(context, account.id, event, {
      kind: "TopUpReversed",
      shares,
      counterparty: event.params.to.toLowerCase(),
    });
  },
);

indexer.onEvent(
  { contract: "MatoCreditLine", event: "CollateralWithdrawn" },
  async ({ event, context }) => {
    const account = await loadAccount(context, event.params.account, event);
    context.Account.set(account);
    recordActivity(context, account.id, event, {
      kind: "CollateralWithdrawn",
      amount: event.params.assets,
      shares: event.params.shares,
    });
  },
);

indexer.onEvent(
  { contract: "MatoCreditLine", event: "YieldFeeTaken" },
  async ({ event, context }) => {
    const account = await loadAccount(context, event.params.account, event);
    context.Account.set(account);
    recordActivity(context, account.id, event, { kind: "YieldFee", shares: event.params.shares });
  },
);

// ------------------------------------------------------------------ credit

indexer.onEvent({ contract: "MatoCreditLine", event: "Drawn" }, async ({ event, context }) => {
  const { amount, drawn, to } = event.params;
  const account = await loadAccount(context, event.params.account, event);

  // `drawn` is the balance after this draw, so equal means it started from zero.
  const opens = drawn === amount;
  const number = opens ? account.cyclesOpened + 1 : account.cyclesOpened;
  const id = cycleId(account.id, number);
  const cycle: Entity<"Cycle"> = (opens ? undefined : await context.Cycle.get(id)) ?? {
    id,
    account_id: account.id,
    number,
    outcome: "Open",
    openedAt: BigInt(event.block.timestamp),
    closedAt: undefined,
    peakDrawn: 0n,
    totalDrawn: 0n,
    totalRepaid: 0n,
    writtenOff: 0n,
    scoreAfter: undefined,
    openTxHash: event.transaction.hash,
    closeTxHash: undefined,
  };
  context.Cycle.set({
    ...cycle,
    totalDrawn: cycle.totalDrawn + amount,
    peakDrawn: drawn > cycle.peakDrawn ? drawn : cycle.peakDrawn,
  });

  context.Account.set({
    ...account,
    drawn,
    cyclesOpened: number,
    totalDrawn: account.totalDrawn + amount,
  });

  const pool = await loadPool(context);
  context.Pool.set({
    ...pool,
    outstanding: pool.outstanding + amount,
    lifetimeDrawn: pool.lifetimeDrawn + amount,
  });

  recordActivity(context, account.id, event, {
    kind: "Draw",
    amount,
    counterparty: to.toLowerCase(),
  });
});

indexer.onEvent({ contract: "MatoCreditLine", event: "Repaid" }, async ({ event, context }) => {
  const { amount, drawn, payer } = event.params;
  const account = await loadAccount(context, event.params.account, event);

  const id = cycleId(account.id, account.cyclesOpened);
  const cycle = await context.Cycle.get(id);
  if (cycle) context.Cycle.set({ ...cycle, totalRepaid: cycle.totalRepaid + amount });

  context.Account.set({ ...account, drawn, totalRepaid: account.totalRepaid + amount });

  const pool = await loadPool(context);
  context.Pool.set({
    ...pool,
    outstanding: pool.outstanding - amount,
    lifetimeRepaid: pool.lifetimeRepaid + amount,
  });

  recordActivity(context, account.id, event, {
    kind: "Repay",
    amount,
    counterparty: payer.toLowerCase(),
  });
});

/**
 * Emitted just before the final Repaid of a cycle. Both find the cycle by
 * `cyclesOpened`, which only moves on the next opening draw, so the order
 * between them does not matter.
 */
indexer.onEvent(
  { contract: "MatoCreditLine", event: "CycleClosed" },
  async ({ event, context }) => {
    const { qualifying, score } = event.params;
    const account = await loadAccount(context, event.params.account, event);

    const id = cycleId(account.id, account.cyclesOpened);
    const cycle = await context.Cycle.get(id);
    if (cycle) {
      context.Cycle.set({
        ...cycle,
        outcome: qualifying ? "Qualified" : "NotQualified",
        closedAt: BigInt(event.block.timestamp),
        scoreAfter: score,
        closeTxHash: event.transaction.hash,
      });
    }

    recordScore(context, account, score, "Cycle", event);
    context.Account.set({
      ...account,
      score,
      cycleCount: qualifying ? account.cycleCount + 1 : account.cycleCount,
      repayCount: qualifying ? account.repayCount + 1 : account.repayCount,
    });
  },
);

indexer.onEvent({ contract: "MatoCreditLine", event: "Defaulted" }, async ({ event, context }) => {
  const { writtenOff, sharesSeized, score } = event.params;
  const account = await loadAccount(context, event.params.account, event);

  const id = cycleId(account.id, account.cyclesOpened);
  const cycle = await context.Cycle.get(id);
  if (cycle) {
    context.Cycle.set({
      ...cycle,
      outcome: "Defaulted",
      closedAt: BigInt(event.block.timestamp),
      writtenOff,
      scoreAfter: score,
      closeTxHash: event.transaction.hash,
    });
  }

  recordScore(context, account, score, "Default", event);
  context.Account.set({
    ...account,
    score,
    drawn: 0n,
    defaulted: true,
    cycleCount: account.cycleCount + 1,
    totalWrittenOff: account.totalWrittenOff + writtenOff,
  });

  const pool = await loadPool(context);
  context.Pool.set({
    ...pool,
    outstanding: pool.outstanding - writtenOff,
    lifetimeWrittenOff: pool.lifetimeWrittenOff + writtenOff,
    defaultCount: pool.defaultCount + 1,
  });

  recordActivity(context, account.id, event, {
    kind: "Default",
    amount: writtenOff,
    shares: sharesSeized,
  });
});

// ------------------------------------------------------------------ lenders

indexer.onEvent({ contract: "MatoCreditLine", event: "Deposit" }, async ({ event, context }) => {
  const pool = await loadPool(context);
  context.Pool.set({ ...pool, lenderDeposits: pool.lenderDeposits + event.params.assets });
});

indexer.onEvent({ contract: "MatoCreditLine", event: "Withdraw" }, async ({ event, context }) => {
  const pool = await loadPool(context);
  context.Pool.set({ ...pool, lenderWithdrawals: pool.lenderWithdrawals + event.params.assets });
});

indexer.onEvent(
  { contract: "MatoCreditLine", event: "PoolSharesRedeemed" },
  async ({ event, context }) => {
    const pool = await loadPool(context);
    context.Pool.set({ ...pool, seizedRedeemed: pool.seizedRedeemed + event.params.assets });
  },
);
