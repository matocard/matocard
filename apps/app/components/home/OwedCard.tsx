"use client";
import { approxIdr, formatAusd } from "../../lib/matocard/money";
import { Button, Card } from "../ui";

/**
 * What is owed, in its locked dollar value (PLAN §7.4: debt is in AUSD, the rupiah figure moves
 * with the rate, and saying so is honest about the FX risk), with the due date and the way out.
 * Settling to zero on time is what raises the score.
 */
export function OwedCard({
  drawn,
  dueDate,
  rate,
  onSettle,
  className = "",
}: {
  drawn: bigint;
  dueDate: string | null;
  rate: string | undefined;
  onSettle: () => void;
  className?: string;
}) {
  return (
    <Card className={`px-5 py-4 ${className}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-medium text-muted">Owed</h2>
          <div className="mt-1 text-[22px] font-semibold [font-variant-numeric:tabular-nums]">
            {formatAusd(drawn)} USD
          </div>
          <div className="text-[12.5px] text-muted">
            {approxIdr(drawn, rate) ? `${approxIdr(drawn, rate)} today` : null}
            {dueDate ? ` · due ${dueDate}` : null}
          </div>
        </div>
        <Button className="!w-auto shrink-0 px-5" onClick={onSettle}>
          Settle
        </Button>
      </div>
      <p className="mt-2 text-[12.5px] text-muted">
        Settle in full by the due date to raise your score.
      </p>
    </Card>
  );
}
