"use client";
import Image from "next/image";
import type { VerifyRecord } from "../../lib/matocard/backend";
import { explorerTx } from "../../lib/matocard/monad";
import { formatAusd, formatBps } from "../../lib/matocard/money";
import { Card, Skeleton } from "../ui";

/** The ratio's range (PLAN §6.3): 150% with no record, 80% at a perfect score. */
const MAX_RATIO = 15_000n;
const MIN_RATIO = 8_000n;

/** Where the ratio sits between 150% and 80%, as a filled track with a marker. */
function RatioTrack({ ratioBps }: { ratioBps: bigint }) {
  const span = Number(MAX_RATIO - MIN_RATIO);
  const done = Math.min(Math.max(Number(MAX_RATIO - ratioBps) / span, 0), 1);
  return (
    <div
      className="mt-3"
      role="img"
      aria-label={`Deposit needed ${formatBps(ratioBps)}, of 150% down to 80%`}
    >
      <div className="relative h-1.5 rounded-full bg-line">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-ink transition-[width] duration-700 ease-out"
          style={{ width: `${done * 100}%` }}
        />
        <div
          className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card bg-ink shadow-sm transition-[left] duration-700 ease-out"
          style={{ left: `${done * 100}%` }}
        />
      </div>
      <div className="mt-1.5 flex justify-between text-[11.5px] text-faint">
        <span>150%</span>
        <span>80%</span>
      </div>
    </div>
  );
}

const OUTCOME: Record<string, string> = {
  Qualified: "Paid on time",
  NotQualified: "Paid, too soon to count",
  Defaulted: "Missed",
  Open: "In progress",
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
  const ratio = BigInt(record.ratioBps);
  return (
    <div className="space-y-3">
      <Card className="relative overflow-hidden px-5 py-4">
        {/* Decoration, so screen readers skip it. The mask fades the photo's grey into the card. */}
        <Image
          src="/art/ring.jpg"
          alt=""
          aria-hidden="true"
          width={150}
          height={150}
          className="pointer-events-none absolute -right-3 -top-3 select-none opacity-80 [mask-image:radial-gradient(closest-side,#000_50%,transparent)]"
        />
        <div className="relative">
          <span
            className={`inline-block rounded-full px-3 py-1 text-[12px] font-semibold ${
              record.defaulted ? "bg-neg/10 text-neg" : "bg-pill text-pill-ink"
            }`}
          >
            {record.defaulted
              ? "Missed a payment"
              : record.verified
                ? "ID verified"
                : "ID not verified"}
          </span>
          <div className="mt-3 text-[13px] font-medium text-muted">Credit score</div>
          <div className="mt-1 text-[44px] font-semibold leading-none tracking-[-0.02em] [font-variant-numeric:tabular-nums]">
            {record.score}
            <span className="text-[18px] font-medium tracking-normal text-muted"> / 100</span>
          </div>
          <div className="mt-2 text-[13px] text-muted">
            Paid on time:{" "}
            <span className="font-semibold text-ink">
              {record.cycles.repaid} of {record.cycles.counted}
            </span>
          </div>
        </div>

        <div className="relative mt-5 border-t border-line pt-4">
          <div className="flex items-baseline justify-between">
            <span className="text-[14px]">Deposit needed</span>
            <span className="text-[14px] font-semibold [font-variant-numeric:tabular-nums]">
              {formatBps(ratio)}
            </span>
          </div>
          <RatioTrack ratioBps={ratio} />
          <p className="mt-2 text-[12.5px] text-muted">
            {ratio <= MIN_RATIO
              ? "The lowest it goes. Keep paying on time to stay here."
              : "Drops each time you pay on time, down to 80%."}
          </p>
        </div>
      </Card>

      {/* No repayments yet means no card at all; a history that is only updating still says so. */}
      {cycles.length === 0 && record.indexer !== "unavailable" ? null : (
        <Card className="px-5 py-4">
          <h2 className="text-sm font-medium text-muted">History</h2>
          {cycles.length === 0 ? (
            <p className="mt-2 text-[13.5px] text-muted">
              Your history is updating. Your score above is current.
            </p>
          ) : (
            <ol className="mt-2 divide-y divide-line">
              {cycles.map((c) => (
                <li key={c.number} className="flex items-center justify-between gap-3 py-2.5">
                  <div>
                    <div className="text-[14.5px] font-semibold">
                      Repayment {c.number}: {OUTCOME[c.outcome] ?? c.outcome}
                    </div>
                    <div className="text-[12.5px] text-muted">
                      {date(c.openedAt)}
                      {c.closedAt ? ` to ${date(c.closedAt)}` : ""} · up to{" "}
                      {formatAusd(BigInt(c.peakDrawn))} USD
                    </div>
                  </div>
                  <div className="shrink-0 text-right text-[12.5px]">
                    {c.scoreAfter !== null ? (
                      <div className="whitespace-nowrap font-semibold">Score {c.scoreAfter}</div>
                    ) : null}
                    <a
                      className="underline"
                      href={explorerTx(c.closeTxHash ?? c.openTxHash)}
                      target="_blank"
                      rel="noopener"
                    >
                      Receipt
                    </a>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Card>
      )}
    </div>
  );
}
