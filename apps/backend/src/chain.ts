import { DepositMethod, gasLimits, matoCreditLineAbi, testAusdAbi } from "@matocard/contracts";
import type { SQL } from "bun";
import {
  type Address,
  BaseError,
  createPublicClient,
  createWalletClient,
  decodeErrorResult,
  defineChain,
  encodeFunctionData,
  type Hex,
  http,
  maxUint256,
  parseEventLogs,
  type TransactionReceipt,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { Config } from "./config";

/** An ERC-3009 `transferWithAuthorization` the sender signed (D11). */
export type Authorization = {
  from: Address;
  to: Address;
  value: bigint;
  validAfter: bigint;
  validBefore: bigint;
  nonce: Hex;
  signature: Hex;
};

export type Chain = ReturnType<typeof createChain>;

const errorsAbi = [...matoCreditLineAbi, ...testAusdAbi].filter((item) => item.type === "error");

/** The custom error's name and arguments, e.g. `IdentityTaken(0x…)`, or viem's message. */
function revertReason(error: unknown): string {
  const data =
    error instanceof BaseError
      ? (
          error.walk((e) => typeof (e as { data?: unknown }).data === "string") as {
            data?: Hex;
          } | null
        )?.data
      : undefined;
  if (data) {
    try {
      const { errorName, args } = decodeErrorResult({ abi: errorsAbi, data });
      return `${errorName}(${(args ?? []).join(", ")})`;
    } catch {}
  }
  return error instanceof BaseError ? error.shortMessage : String(error);
}

/**
 * Contract reads, plus the relayer: the only code that sends transactions
 * (PLAN §7.2 rules 6–8). One key, one transaction at a time, nonce kept here
 * because Monad has no global mempool, published gas limits because Monad
 * charges the limit. Every send is logged in `relayer_txs` before it goes out,
 * and every operation reads back the state it was meant to change.
 */
export function createChain(sql: SQL, config: Config) {
  const { chain: c } = config;
  const chain = defineChain({
    id: c.chainId,
    name: "monad",
    nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
    rpcUrls: { default: { http: [c.rpcUrl] } },
  });
  const account = privateKeyToAccount(c.relayerKey);
  const client = createPublicClient({ chain, transport: http(c.rpcUrl) });
  const wallet = createWalletClient({ account, chain, transport: http(c.rpcUrl) });
  const line = { address: c.creditLine, abi: matoCreditLineAbi } as const;
  const ausd = { address: c.ausd, abi: testAusdAbi } as const;

  const read = {
    isVerified: (w: Address) =>
      client.readContract({ ...line, functionName: "isVerified", args: [w] }),
    identityOf: (w: Address) =>
      client.readContract({ ...line, functionName: "identityOf", args: [w] }),
    accountOf: (w: Address) =>
      client.readContract({ ...line, functionName: "accountOf", args: [w] }),
    collateralOf: (w: Address) =>
      client.readContract({ ...line, functionName: "collateralOf", args: [w] }),
    collateralValueOf: (w: Address) =>
      client.readContract({ ...line, functionName: "collateralValueOf", args: [w] }),
    scoreOf: (w: Address) => client.readContract({ ...line, functionName: "scoreOf", args: [w] }),
    limitOf: (w: Address) => client.readContract({ ...line, functionName: "limitOf", args: [w] }),
    availableOf: (w: Address) =>
      client.readContract({ ...line, functionName: "availableOf", args: [w] }),
    ausdBalanceOf: (w: Address) =>
      client.readContract({ ...ausd, functionName: "balanceOf", args: [w] }),
    authorizationUsed: (from: Address, nonce: Hex) =>
      client.readContract({ ...ausd, functionName: "authorizationState", args: [from, nonce] }),
  };

  // one job at a time, in order: the whole relayer shares one nonce sequence
  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T>(job: () => Promise<T>): Promise<T> => {
    const run = queue.then(job, job);
    queue = run.catch(() => {});
    return run;
  };
  let nonce: number | undefined;
  const pendingNonce = () =>
    client.getTransactionCount({ address: account.address, blockTag: "pending" });

  type Tx = { to: Address; data?: Hex; value?: bigint; gas: bigint };

  /** Sends one transaction and waits for it. Call only inside `serial`. */
  async function send(
    kind: string,
    who: Address,
    amount: bigint,
    tx: Tx,
    ref?: string,
  ): Promise<TransactionReceipt> {
    // a call first: a revert costs nothing here, and comes back with its reason
    await client.call({ account, ...tx }).catch((error) => {
      throw new Error(`${kind} would revert: ${revertReason(error)}`);
    });
    const [{ id }] = await sql`
      INSERT INTO relayer_txs (kind, wallet, amount, ref)
      VALUES (${kind}, ${who.toLowerCase()}, ${amount}, ${ref ?? null})
      RETURNING id`;
    let hash: Hex | undefined;
    try {
      nonce ??= await pendingNonce();
      for (let attempt = 0; ; attempt++) {
        try {
          hash = await wallet.sendTransaction({ ...tx, nonce });
          break;
        } catch (error) {
          // rule 7: never resend blind. If the nonce moved, that send may have
          // landed; stop and leave it to a person rather than risk a double.
          const onchain = await pendingNonce();
          if (onchain !== nonce) {
            nonce = onchain;
            throw error;
          }
          if (attempt === 2) throw error;
          await Bun.sleep(500 * 2 ** attempt);
        }
      }
      await sql`UPDATE relayer_txs SET status = 'sent', nonce = ${nonce}, tx_hash = ${hash},
                updated_at = now() WHERE id = ${id}`;
      nonce++;
      const receipt = await client.waitForTransactionReceipt({ hash, timeout: 60_000 });
      const status = receipt.status === "success" ? "confirmed" : "reverted";
      await sql`UPDATE relayer_txs SET status = ${status}, updated_at = now() WHERE id = ${id}`;
      if (status === "reverted") throw new Error(`${kind} reverted: ${hash}`);
      return receipt;
    } catch (error) {
      // a sent transaction whose receipt never came stays 'sent' for a person to check
      if (!hash) {
        await sql`UPDATE relayer_txs SET status = 'failed', error = ${String(error)},
                  updated_at = now() WHERE id = ${id}`;
      }
      throw error;
    }
  }

  const call = (fn: string, args: readonly unknown[]) =>
    // biome-ignore lint/suspicious/noExplicitAny: one encoder for every credit-line call
    encodeFunctionData({ abi: matoCreditLineAbi, functionName: fn as any, args: args as any });

  /** Rule 6: daily AUSD the relayer may credit, per user and in total. */
  async function checkCaps(user: Address, amount: bigint) {
    const [row] = await sql`
      SELECT coalesce(sum(amount) FILTER (WHERE wallet = ${user.toLowerCase()}), 0) AS mine,
             coalesce(sum(amount), 0) AS everyone
      FROM relayer_txs
      WHERE kind = 'depositFor' AND status IN ('queued', 'sent', 'confirmed')
        AND created_at >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`;
    if (BigInt(row.mine) + amount > config.caps.perUser)
      throw new Error("daily cap per user reached");
    if (BigInt(row.everyone) + amount > config.caps.global)
      throw new Error("daily global cap reached");
  }

  return {
    relayer: account.address,
    read,
    /** Rule 7: a transaction for `ref` that is queued, sent or confirmed must not be sent again. */
    async attempts(ref: string) {
      const rows = await sql`SELECT kind, status FROM relayer_txs WHERE ref = ${ref} ORDER BY id`;
      return rows as { kind: string; status: string }[];
    },

    /** Binds an identity to a wallet. Already bound to the same identity is success. */
    setVerified: (who: Address, identityHash: Hex, ref?: string) =>
      serial(async () => {
        if (await read.isVerified(who)) {
          if ((await read.identityOf(who)) === identityHash) return { hash: null };
          throw new Error(`${who} is verified with another identity`);
        }
        const receipt = await send(
          "setVerified",
          who,
          0n,
          {
            to: c.creditLine,
            data: call("setVerified", [who, identityHash]),
            gas: gasLimits.setVerified,
          },
          ref,
        );
        if ((await read.identityOf(who)) !== identityHash)
          throw new Error("setVerified did not stick");
        return { hash: receipt.transactionHash };
      }),

    /** Credits a top-up from the treasury. Returns the vault shares and when they count. */
    depositFor: (who: Address, assets: bigint, method: "card" | "bank", ref?: string) =>
      serial(async () => {
        await checkCaps(who, assets);
        const allowance = await client.readContract({
          ...ausd,
          functionName: "allowance",
          args: [account.address, c.creditLine],
        });
        if (allowance < assets) {
          await send("approve", c.creditLine, 0n, {
            to: c.ausd,
            data: encodeFunctionData({
              abi: testAusdAbi,
              functionName: "approve",
              args: [c.creditLine, maxUint256],
            }),
            gas: gasLimits.approve,
          });
        }
        const receipt = await send(
          "depositFor",
          who,
          assets,
          {
            to: c.creditLine,
            data: call("depositFor", [
              who,
              assets,
              method === "card" ? DepositMethod.Card : DepositMethod.Bank,
            ]),
            gas: gasLimits.depositFor,
          },
          ref,
        );
        const [event] = parseEventLogs({
          abi: matoCreditLineAbi,
          eventName: "CollateralDeposited",
          logs: receipt.logs,
        });
        if (
          !event ||
          event.args.account.toLowerCase() !== who.toLowerCase() ||
          event.args.assets !== assets
        ) {
          throw new Error(`depositFor ${receipt.transactionHash}: no matching CollateralDeposited`);
        }
        return {
          hash: receipt.transactionHash,
          shares: event.args.shares,
          countsFrom: event.args.countsFrom,
        };
      }),

    /** Repays from the treasury after a fiat settlement. Capped at what is owed, like the contract. */
    repayFor: (who: Address, amount: bigint, ref?: string) =>
      serial(async () => {
        const before = (await read.accountOf(who)).drawn;
        const pay = amount < before ? amount : before;
        // repaid some other way meanwhile: nothing to send, the caller books the overpayment
        if (pay === 0n) return { hash: null, repaid: 0n };
        const allowance = await client.readContract({
          ...ausd,
          functionName: "allowance",
          args: [account.address, c.creditLine],
        });
        if (allowance < pay) {
          await send("approve", c.creditLine, 0n, {
            to: c.ausd,
            data: encodeFunctionData({
              abi: testAusdAbi,
              functionName: "approve",
              args: [c.creditLine, maxUint256],
            }),
            gas: gasLimits.approve,
          });
        }
        const receipt = await send(
          "repayFor",
          who,
          pay,
          {
            to: c.creditLine,
            data: call("repayFor", [who, pay]),
            gas: gasLimits.repayFor,
          },
          ref,
        );
        if ((await read.accountOf(who)).drawn !== before - pay)
          throw new Error("repayFor did not stick");
        return { hash: receipt.transactionHash, repaid: pay };
      }),

    /** Chargeback inside the hold: pending shares go back to the treasury. */
    cancelPending: (who: Address, shares: bigint, ref?: string) =>
      serial(async () => {
        const receipt = await send(
          "cancelPending",
          who,
          0n,
          {
            to: c.creditLine,
            data: call("cancelPending", [who, shares]),
            gas: gasLimits.cancelPending,
          },
          ref,
        );
        const [event] = parseEventLogs({
          abi: matoCreditLineAbi,
          eventName: "PendingCancelled",
          logs: receipt.logs,
        });
        if (event?.args.shares !== shares)
          throw new Error(`cancelPending ${receipt.transactionHash}: no event`);
        return { hash: receipt.transactionHash };
      }),

    /** Submits a sender-signed ERC-3009 transfer; the relayer pays the gas (D11). */
    transferWithAuthorization: (a: Authorization, ref?: string) =>
      serial(async () => {
        const receipt = await send(
          "transferWithAuthorization",
          a.from,
          a.value,
          {
            to: c.ausd,
            data: encodeFunctionData({
              abi: testAusdAbi,
              functionName: "transferWithAuthorization",
              args: [a.from, a.to, a.value, a.validAfter, a.validBefore, a.nonce, a.signature],
            }),
            gas: gasLimits.transferWithAuthorization,
          },
          ref,
        );
        if (!(await read.authorizationUsed(a.from, a.nonce)))
          throw new Error("authorization not used");
        return { hash: receipt.transactionHash };
      }),

    /** MON for fees, so a new user never buys MON (D3). */
    drip: (who: Address, ref?: string) =>
      serial(async () => {
        const receipt = await send(
          "drip",
          who,
          0n,
          { to: who, value: config.dripWei, gas: 21_000n },
          ref,
        );
        return { hash: receipt.transactionHash };
      }),
  };
}
