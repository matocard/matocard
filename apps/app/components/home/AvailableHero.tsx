"use client";
import { approxIdr, formatAusd } from "../../lib/matocard/money";

/**
 * Home's headline: what the card can spend right now (`availableOf`), in rupiah first because
 * that is the money Siti thinks in (PLAN §3: headline in local currency with "≈"). The dollar
 * figure sits under it with "AUSD" on the same row: the Agora bounty needs an AUSD balance on
 * screen, and a detail row is the one place the copy rules allow the word.
 *
 * An unread figure is a dash. `0` is a claim about someone's money.
 */
export function AvailableHero({
  available,
  rate,
  issued,
}: {
  available: bigint | undefined;
  /** USD/IDR; without it the dollar figure leads. */
  rate: string | undefined;
  /** False before identity is verified: there is no card to spend from yet. */
  issued: boolean;
}) {
  const idr = approxIdr(available, rate);
  return (
    <div className="py-[26px]">
      <div className="text-[15px] font-medium text-muted">{issued ? "Available" : "Your card"}</div>
      {!issued ? (
        <div className="mt-2 text-[clamp(26px,8vw,34px)] font-semibold leading-tight tracking-[-.02em]">
          Not issued yet
        </div>
      ) : available === undefined ? (
        <div className="mt-2 text-[clamp(32px,12vw,54px)] font-semibold leading-none">—</div>
      ) : (
        <>
          <div className="mt-2 whitespace-nowrap text-[clamp(30px,10vw,50px)] font-semibold leading-none tracking-[-.02em] [font-variant-numeric:tabular-nums]">
            {idr ?? `${formatAusd(available)} USD`}
          </div>
          <div className="mt-2 text-[14px] text-muted [font-variant-numeric:tabular-nums]">
            {formatAusd(available)} USD · AUSD
          </div>
        </>
      )}
    </div>
  );
}
