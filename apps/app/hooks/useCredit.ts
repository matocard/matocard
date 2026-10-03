"use client";
import { useCallback, useState } from "react";
import { type Address, parseSignature } from "viem";
import { useBalance, useConfig, useReadContracts, useWriteContract } from "wagmi";
import { getAccount, readContract, signTypedData, switchChain } from "wagmi/actions";
import {
  AUSD,
  ausdAbi,
  CREDIT_LINE,
  creditLineAbi,
  gasLimits,
  MONAD_CHAIN_ID,
  ratioBps,
} from "../lib/matocard/monad";
import { POLL_ACTIVE, pollInterval } from "../lib/matocard/polling";
import { awaitSuccess } from "../lib/matocard/tx";
import { useWallet } from "./useWallet";

const line = { address: CREDIT_LINE, abi: creditLineAbi, chainId: MONAD_CHAIN_ID } as const;
const ausd = { address: AUSD, abi: ausdAbi, chainId: MONAD_CHAIN_ID } as const;

/** How long a repayment permit stays valid: long enough to sign and send, short enough to expire. */
const PERMIT_SECONDS = 30n * 60n;

/**
 * The cardholder's credit line on Monad, read straight from `MatoCreditLine`, and the four
 * transactions they sign themselves.
 *
 * Reads come off the contract, never the indexer: vault yield moves collateral (and so the limit)
 * without an event, and a card hold ends on a timestamp, not a transaction. Every figure is a bigint
 * in AUSD's 6 decimals, and `undefined` until read: an unread figure is a dash on screen, never 0.
 *
 * Writes go to Monad whatever chain the wallet sits on (it is switched first), send the published
 * gas limits (Monad charges the limit), and resolve only once the state they were meant to change
 * has changed (`awaitSuccess`). Top-ups, fiat settlements, plain sends and cash-outs are not here:
 * the backend's relayer sends those.
 */
export function useCredit() {
  const { address } = useWallet();
  const config = useConfig();
  const who = address as Address | undefined;
  const enabled = Boolean(who);
  const [pending, setPending] = useState(false);

  const reads = useReadContracts({
    allowFailure: false,
    contracts: who
      ? ([
          { ...line, functionName: "isVerified", args: [who] },
          { ...line, functionName: "accountOf", args: [who] },
          { ...line, functionName: "collateralOf", args: [who] },
          { ...line, functionName: "collateralValueOf", args: [who] },
          { ...line, functionName: "scoreOf", args: [who] },
          { ...line, functionName: "limitOf", args: [who] },
          { ...line, functionName: "availableOf", args: [who] },
          { ...ausd, functionName: "balanceOf", args: [who] },
        ] as const)
      : [],
    query: {
      enabled,
      // Faster while a card top-up is in its hold or a transaction is in flight: that is when
      // someone is watching a figure change.
      refetchInterval: (query) => {
        const collateral = query.state.data?.[2] as { pendingShares: bigint } | undefined;
        return pending
          ? POLL_ACTIVE
          : pollInterval(Boolean(collateral && collateral.pendingShares > 0n));
      },
    },
  });
  const mon = useBalance({ address: who, chainId: MONAD_CHAIN_ID, query: { enabled } });

  const [verified, account, collateral, collateralValue, score, limit, available, ausdBalance] =
    reads.data ?? [];

  const { writeContractAsync } = useWriteContract();

  /** Runs one of the user's own transactions on Monad and waits until it has really landed. */
  const send = useCallback(
    async (
      request: Parameters<typeof writeContractAsync>[0],
      landed: () => Promise<boolean>,
    ): Promise<`0x${string}`> => {
      if (!who) throw new Error("Sign in first.");
      setPending(true);
      try {
        if (getAccount(config).chainId !== MONAD_CHAIN_ID) {
          await switchChain(config, { chainId: MONAD_CHAIN_ID });
        }
        const hash = await writeContractAsync(request);
        await awaitSuccess(config, hash, MONAD_CHAIN_ID, landed);
        await reads.refetch();
        return hash;
      } finally {
        setPending(false);
      }
    },
    [who, config, writeContractAsync, reads],
  );

  const accountNow = useCallback(async () => {
    if (!who) throw new Error("Sign in first.");
    return readContract(config, { ...line, functionName: "accountOf", args: [who] });
  }, [config, who]);

  /** Draws `amount` against the limit and pays it straight to `to` (Mom, the payout treasury, a merchant). */
  const draw = useCallback(
    async (amount: bigint, to: Address) => {
      const before = (await accountNow()).drawn;
      return send(
        {
          ...line,
          functionName: "draw",
          args: [amount, to],
          gas: gasLimits.draw,
        },
        async () => (await accountNow()).drawn === before + amount,
      );
    },
    [accountNow, send],
  );

  /**
   * Repays from the user's own AUSD in one transaction, with a signed permit instead of an
   * approval. `amount` omitted means the whole balance, read fresh here: a figure the screen was
   * holding goes stale exactly when someone has just drawn. Only repaying to zero closes a cycle.
   */
  const repay = useCallback(
    async (amount?: bigint) => {
      if (!who) throw new Error("Sign in first.");
      const owed = (await accountNow()).drawn;
      if (owed === 0n) throw new Error("Nothing is owed.");
      const value = amount === undefined || amount > owed ? owed : amount;
      const balance = await readContract(config, {
        ...ausd,
        functionName: "balanceOf",
        args: [who],
      });
      if (balance < value) throw new Error("Not enough in your balance to pay this.");

      const [, name, version] = await readContract(config, {
        ...ausd,
        functionName: "eip712Domain",
      });
      const nonce = await readContract(config, { ...ausd, functionName: "nonces", args: [who] });
      const deadline = BigInt(Math.floor(Date.now() / 1000)) + PERMIT_SECONDS;
      const signature = await signTypedData(config, {
        domain: { name, version, chainId: MONAD_CHAIN_ID, verifyingContract: AUSD },
        types: {
          Permit: [
            { name: "owner", type: "address" },
            { name: "spender", type: "address" },
            { name: "value", type: "uint256" },
            { name: "nonce", type: "uint256" },
            { name: "deadline", type: "uint256" },
          ],
        },
        primaryType: "Permit",
        message: { owner: who, spender: CREDIT_LINE, value, nonce, deadline },
      });
      const { r, s, v, yParity } = parseSignature(signature);
      return send(
        {
          ...line,
          functionName: "repayWithPermit",
          args: [value, deadline, Number(v ?? BigInt(yParity + 27)), r, s],
          gas: gasLimits.repayWithPermit,
        },
        async () => (await accountNow()).drawn === owed - value,
      );
    },
    [who, config, accountNow, send],
  );

  /** Settles from collateral instead of new money ("deduct from collateral", PLAN §8 Settle). */
  const repayFromCollateral = useCallback(
    async (amount?: bigint) => {
      const owed = (await accountNow()).drawn;
      if (owed === 0n) throw new Error("Nothing is owed.");
      const value = amount === undefined || amount > owed ? owed : amount;
      return send(
        {
          ...line,
          functionName: "repayFromCollateral",
          args: [value],
          gas: gasLimits.repayFromCollateral,
        },
        async () => (await accountNow()).drawn === owed - value,
      );
    },
    [accountNow, send],
  );

  /** Takes `shares` of collateral back as AUSD, if the limit still covers what is owed. */
  const withdrawCollateral = useCallback(
    async (shares: bigint) => {
      if (!who) throw new Error("Sign in first.");
      const read = () =>
        readContract(config, { ...line, functionName: "collateralOf", args: [who] });
      const before = (await read()).shares;
      return send(
        {
          ...line,
          functionName: "withdrawCollateral",
          args: [shares],
          gas: gasLimits.withdrawCollateral,
        },
        async () => (await read()).shares < before,
      );
    },
    [who, config, send],
  );

  return {
    loading: enabled && reads.isLoading,
    error: reads.error,
    refresh: reads.refetch,
    verified,
    score,
    /** Collateral needed per unit of credit, in bps: why the limit is what it is. */
    ratioBps: score === undefined ? undefined : ratioBps(score),
    limit,
    available,
    drawn: account?.drawn,
    /** Unix seconds; 0 when nothing is owed. */
    dueAt: account?.dueAt,
    defaulted: account?.defaulted,
    cycles: account && { counted: account.cycleCount, repaid: account.repayCount },
    collateral: collateral && {
      /** Counted toward the limit, net of the yield fee owed. */
      value: collateralValue,
      shares: collateral.shares,
      /**
       * Card top-ups waiting out their hold. They count from `pendingUntil` (unix seconds); compare
       * it with the clock after mount, never during render. `value` already includes them once due.
       */
      pendingShares: collateral.pendingShares,
      pendingUntil: collateral.pendingUntil,
    },
    /** AUSD in the account itself: what Mom receives, and what `repay` pays from. */
    ausdBalance,
    /** MON for fees, dripped by the relayer after KYC. A draw cannot be sent without it. */
    monBalance: mon.data?.value,
    pending,
    draw,
    repay,
    repayFromCollateral,
    withdrawCollateral,
  };
}
