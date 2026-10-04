"use client";
import type { VerifyRecord } from "../../lib/matocard/backend";
import { explorerAddress, explorerTx } from "../../lib/matocard/monad";
import { formatAusd, formatBps } from "../../lib/matocard/money";
import { Card, Skeleton } from "../ui";

const OUTCOME: Record<string, string> = {
  Qualified: "Repaid on time",
  NotQualified: "Repaid, did not count",
  Defaulted: "Missed",
  Open: "Open",
};

const date = (seconds: string | null | undefined) =>
  seconds
    ? new Date(Number(seconds) * 1000).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "";

/**
 * A credit record anyone can check (PLAN §3 step 7): score, cycles and each cycle's dates, read
 * from the credit line on Monad and its indexer. No name, no document number: the account address
 * is the only identifier, and every figure links to the transaction it came from.
 */
export function RecordView({
  record,
  loading,
  error,
}: {
  record: VerifyRecord | undefined;
  loading: boolean;
  error: string | undefined;
}) {
  if (error) {
    return <Card className="px-5 py-4 text-[14px] text-neg">{error}</Card>;
  }
  if (loading || !record) {
    return (
      <Card className="px-5 py-4">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="mt-3 h-10 w-24" />
      </Card>
    );
  }
  const cycles = record.history?.cycles ?? [];
  return (
    <div className="space-y-3">
      <Card className="px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[13px] font-medium text-muted">Credit score</div>
            <div className="mt-1 text-[40px] font-semibold leading-none [font-variant-numeric:tabular-nums]">
              {record.score}
              <span className="text-[18px] font-medium text-muted"> / 100</span>
            </div>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-[12.5px] font-semibold ${
              record.defaulted ? "bg-neg/10 text-neg" : "bg-pill text-pill-ink"
            }`}
          >
            {record.defaulted
              ? "Has a default"
              : record.verified
                ? "Verified person"
                : "Not verified"}
          </span>
        </div>
        <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
          <div>
            <dt className="text-[12px] text-muted">Repaid on time</dt>
            <dd className="text-[17px] font-semibold">{record.cycles.repaid}</dd>
          </div>
          <div>
            <dt className="text-[12px] text-muted">Cycles</dt>
            <dd className="text-[17px] font-semibold">{record.cycles.counted}</dd>
          </div>
          <div>
            <dt className="text-[12px] text-muted">Collateral ratio</dt>
            <dd className="text-[17px] font-semibold">{formatBps(BigInt(record.ratioBps))}</dd>
          </div>
        </dl>
      </Card>

      <Card className="px-5 py-4">
        <h2 className="text-sm font-medium text-muted">History</h2>
        {record.history === null ? (
          <p className="mt-2 text-[13.5px] text-muted">
            {record.indexer === "unavailable"
              ? "The history is catching up. The score above is read from the contract now."
              : "No cycles yet."}
          </p>
        ) : cycles.length === 0 ? (
          <p className="mt-2 text-[13.5px] text-muted">No cycles yet.</p>
        ) : (
          <ol className="mt-2 divide-y divide-line">
            {cycles.map((c) => (
              <li key={c.number} className="flex items-center justify-between gap-3 py-2.5">
                <div>
                  <div className="text-[14.5px] font-semibold">
                    Cycle {c.number}: {OUTCOME[c.outcome] ?? c.outcome}
                  </div>
                  <div className="text-[12.5px] text-muted">
                    {date(c.openedAt)}
                    {c.closedAt ? ` to ${date(c.closedAt)}` : ""} · peak{" "}
                    {formatAusd(BigInt(c.peakDrawn))} USD
                  </div>
                </div>
                <div className="text-right text-[12.5px]">
                  {c.scoreAfter !== null ? (
                    <div className="font-semibold">Score {c.scoreAfter}</div>
                  ) : null}
                  <a
                    className="underline"
                    href={explorerTx(c.closeTxHash ?? c.openTxHash)}
                    target="_blank"
                    rel="noopener"
                  >
                    Proof
                  </a>
                </div>
              </li>
            ))}
          </ol>
        )}
      </Card>

      <p className="text-center text-[12px] text-muted">
        Read from the credit line on Monad, not from Matocard's database.{" "}
        <a
          className="underline"
          href={explorerAddress(record.account)}
          target="_blank"
          rel="noopener"
        >
          Check it yourself
        </a>
      </p>
    </div>
  );
}
