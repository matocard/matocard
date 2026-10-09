"use client";
import { approxLocal, formatAusd, type LocalCurrency } from "../../lib/matocard/money";

/**
 * Home's headline: what the card can spend right now (`availableOf`), in the user's own currency
 * first (ringgit for Siti in Kuala Lumpur, rupiah in Indonesia) because that is the money they think in (PLAN §3; no "≈", Axel's call on 9 Oct). The dollar
 * figure sits under it in AUSD, one unit rather than "USD · AUSD" (Axel, 9 Oct): the Agora bounty needs an AUSD balance on
 * screen, and a detail row is the one place the copy rules allow the word.
 *
 * An unread figure is a dash. `0` is a claim about someone's money.
 */
export function AvailableHero({
  available,
  rate,
  currency,
  issued,
}: {
  available: bigint | undefined;
  /** USD to the user's own currency; without it the dollar figure leads. */
  rate: string | undefined;
  currency: LocalCurrency;
  /** False before identity is verified: there is no card to spend from yet. */
  issued: boolean;
}) {
  const local = approxLocal(available, rate, currency);
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
            {local ?? `${formatAusd(available)} USD`}
          </div>
          <div className="mt-2 text-[14px] text-muted [font-variant-numeric:tabular-nums]">
            {formatAusd(available)} AUSD
          </div>
        </>
      )}
    </div>
  );
}
