"use client";
import { approxIdr, formatAusd, formatBps } from "../../lib/matocard/money";
import { Card } from "../ui";

const DASH = "—";

/**
 * Why the limit is what it is (PLAN §3: always show it). The limit is collateral divided by the
 * ratio, and the ratio falls from 150% to 80% as the score rises, so the three rows are the whole
 * calculation and a user can check it by hand.
 */
export function LimitBreakdown({
  collateral,
  score,
  ratioBps,
  limit,
  yieldEarned,
  heldUntil,
  rate,
  className = "",
}: {
  collateral: bigint | undefined;
  score: bigint | undefined;
  ratioBps: bigint | undefined;
  limit: bigint | undefined;
  yieldEarned: bigint | undefined;
  /** A card top-up still in its hold, as a readable time; null when nothing is held. */
  heldUntil: string | null;
  rate: string | undefined;
  className?: string;
}) {
  const rows: { label: string; value: string; note?: string | null }[] = [
    {
      label: "Collateral",
      value: collateral === undefined ? DASH : `${formatAusd(collateral)} USD`,
      note: approxIdr(collateral, rate),
    },
    { label: "Credit score", value: score === undefined ? DASH : `${score} of 100` },
    {
      label: "Collateral ratio",
      value: ratioBps === undefined ? DASH : formatBps(ratioBps),
      note: "Falls as your score rises, down to 80%",
    },
  ];
  return (
    <Card className={`px-5 py-4 ${className}`}>
      <h2 className="text-sm font-medium text-muted">Why your limit is this</h2>
      <dl className="mt-3 divide-y divide-line">
        {rows.map((row) => (
          <div key={row.label} className="flex items-start justify-between gap-4 py-2.5">
            <dt className="text-[14.5px]">
              {row.label}
              {row.note ? (
                <span className="mt-0.5 block text-[12.5px] text-muted">{row.note}</span>
              ) : null}
            </dt>
            <dd className="text-[14.5px] font-semibold [font-variant-numeric:tabular-nums]">
              {row.value}
            </dd>
          </div>
        ))}
        <div className="flex items-start justify-between gap-4 py-2.5">
          <dt className="text-[14.5px] font-semibold">Limit</dt>
          <dd className="text-[14.5px] font-semibold [font-variant-numeric:tabular-nums]">
            {limit === undefined ? DASH : `${formatAusd(limit)} USD`}
          </dd>
        </div>
      </dl>
      {yieldEarned !== undefined && yieldEarned > 0n ? (
        <p className="mt-1 text-[12.5px] text-muted">
          Your collateral has earned {formatAusd(yieldEarned)} USD so far. Interest-free to borrow.
        </p>
      ) : null}
      {heldUntil ? (
        <p className="mt-1 text-[12.5px] text-muted">
          A card top-up is on hold and counts from {heldUntil}.
        </p>
      ) : null}
    </Card>
  );
}
