"use client";
import Link from "next/link";
import { approxLocal, formatAusd, type LocalCurrency } from "../../lib/matocard/money";
import { CoinBadge, Section } from "../ui";

const CARD =
  "rounded-[16px] border border-line bg-white px-4 [box-shadow:0_1px_2px_rgba(17,19,22,.04),0_10px_22px_-16px_rgba(17,19,22,.22)]";

/**
 * Money held in the account (what family sent, or AUSD from the faucet), and, as its own section,
 * the way out of it. Kept apart on purpose: a balance is a fact about the account, cashing out is
 * an action, and a link tucked into the balance row read as part of the figure. The Agora bounty
 * needs AUSD on screen, so it sits on this detail row (PLAN §3). The ⓘ says how this differs from
 * the card's Available, which is borrowed (Axel, 10 Oct).
 */
export function BalanceSection({
  balance,
  rate,
  currency,
  className = "",
}: {
  balance: bigint;
  rate: string | undefined;
  currency: LocalCurrency;
  className?: string;
}) {
  return (
    <div className={className}>
      <Section
        title="Balance"
        info="Money sent to you. It's yours, with nothing to pay back. Send it on or cash it out to your bank. Held as AUSD."
        className="mb-[22px]"
      >
        <div className={CARD}>
          <div className="flex items-center gap-3 py-3.5">
            <CoinBadge token="AUSD" size={32} />
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-semibold">US dollars</div>
              <div className="mt-0.5 text-[11.5px] text-muted">AUSD</div>
            </div>
            <div className="text-right">
              <div className="text-[14px] font-semibold tabular-nums">
                {formatAusd(balance)} USD
              </div>
              <div className="text-[11.5px] text-muted tabular-nums">
                {approxLocal(balance, rate, currency) ?? ""}
              </div>
            </div>
          </div>
        </div>
      </Section>

      <Section title="Cash out">
        <div className={CARD}>
          <Link
            href="/cashout"
            className="-mx-4 flex items-center gap-3 px-4 py-3.5 no-underline transition-colors hover:bg-[#f4f4f4]"
          >
            <CoinBadge token="IDR" size={32} />
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-semibold">To your bank</div>
              <div className="mt-0.5 text-[11.5px] text-muted">
                In rupiah, to BCA, BRI, BNI or Mandiri
              </div>
            </div>
            <svg
              aria-hidden="true"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              className="shrink-0 text-faint"
            >
              <path d="M9 6l6 6-6 6" />
            </svg>
          </Link>
        </div>
      </Section>
    </div>
  );
}
