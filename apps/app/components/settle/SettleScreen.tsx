"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useBackend } from "../../hooks/useBackend";
import { useCredit } from "../../hooks/useCredit";
import { useFx } from "../../hooks/useFx";
import { getQuote, startSettlement } from "../../lib/matocard/backend";
import { explorerTx } from "../../lib/matocard/monad";
import { approxIdr, formatAusd } from "../../lib/matocard/money";
import { Button, Card, Spinner, TransactionStatus } from "../ui";
import { SubHeader } from "../ui/SubHeader";

type Way = "rupiah" | "balance" | "collateral";

/**
 * Settle (PLAN §3 step 6, §8): pay back what is owed. Only paying to zero, on time, closes a cycle
 * and raises the score.
 *
 * Three ways, from issue #71: in rupiah at Xendit's checkout (the backend's relayer then repays
 * onchain), from AUSD already in the account (`repayWithPermit`, one transaction), or from
 * collateral (`repayFromCollateral`). The debt is in dollars, so the rupiah figure moves with the
 * rate; the screen says so (PLAN §7.4).
 */
export function SettleScreen() {
  const router = useRouter();
  const credit = useCredit();
  const { rate } = useFx();
  const backend = useBackend();
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [done, setDone] = useState<`0x${string}` | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [working, setWorking] = useState<Way | null>(null);

  const owed = credit.drawn;
  const canFromBalance = owed !== undefined && (credit.ausdBalance ?? 0n) >= owed;
  const canFromCollateral = owed !== undefined && (credit.collateral?.value ?? 0n) >= owed;

  const inRupiah = async () => {
    setWorking("rupiah");
    const checkout = await backend.run(async (session) => {
      const quote = await getQuote("USD/IDR");
      return startSettlement(session, quote.id);
    });
    setWorking(null);
    if (!checkout) return;
    setCheckoutUrl(checkout.checkoutUrl);
    window.open(checkout.checkoutUrl, "_blank", "noopener");
  };

  const onchain = async (way: "balance" | "collateral") => {
    setWorking(way);
    setFailed(null);
    try {
      setDone(way === "balance" ? await credit.repay() : await credit.repayFromCollateral());
    } catch (e) {
      setFailed(e instanceof Error ? (e.message.split("\n")[0] ?? null) : "Could not settle.");
    } finally {
      setWorking(null);
    }
  };

  if (done) {
    return (
      <div className="flex flex-1 flex-col">
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <TransactionStatus status="confirmed" size="large" href={explorerTx(done)} />
          <p className="mt-3 text-[14px] text-muted">
            Settled. Your score updates with this cycle.
          </p>
        </div>
        <Button onClick={() => router.push("/home")}>Done</Button>
      </div>
    );
  }

  if (checkoutUrl) {
    return (
      <div className="flex flex-1 flex-col">
        <SubHeader title="Settle" />
        <Card className="px-5 py-4">
          <h2 className="text-[16px] font-semibold">Finish paying in the new tab</h2>
          <p className="mt-1 text-[13.5px] text-muted">
            Once it is paid, your balance goes to zero here within a minute.
          </p>
          <a
            className="mt-3 block text-[13.5px] font-medium underline"
            href={checkoutUrl}
            target="_blank"
            rel="noopener"
          >
            Open the payment page again
          </a>
        </Card>
        <div className="mt-auto">
          <Button onClick={() => router.push("/home")}>Back to Home</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <SubHeader title="Settle" />
      <div className="mb-5 text-center">
        <div className="text-[15px] font-medium text-muted">You owe</div>
        <div className="mt-1 text-[clamp(30px,10vw,44px)] font-semibold [font-variant-numeric:tabular-nums]">
          {owed === undefined ? "—" : `${formatAusd(owed)} USD`}
        </div>
        {owed !== undefined && approxIdr(owed, rate) ? (
          <div className="text-[13px] text-muted">{approxIdr(owed, rate)} today</div>
        ) : null}
      </div>

      {owed === 0n ? (
        <Card className="px-5 py-4 text-center text-[14px] text-muted">Nothing is owed.</Card>
      ) : (
        <div className="space-y-3">
          <Option
            title="Pay in rupiah"
            body="Bank transfer or QRIS. The amount is rounded up to the next rupiah."
            busy={working === "rupiah"}
            disabled={working !== null || owed === undefined}
            onClick={inRupiah}
          />
          <Option
            title="Pay from your balance"
            body={
              canFromBalance
                ? `${formatAusd(credit.ausdBalance ?? 0n)} USD in your balance`
                : "Not enough in your balance"
            }
            busy={working === "balance"}
            disabled={working !== null || !canFromBalance}
            onClick={() => onchain("balance")}
          />
          <Option
            title="Use your collateral"
            body="Deducted from what backs your card, so your limit goes down with it."
            busy={working === "collateral"}
            disabled={working !== null || !canFromCollateral}
            onClick={() => onchain("collateral")}
          />
        </div>
      )}

      {backend.error || failed ? (
        <p className="mt-3 text-center text-[13px] font-medium text-neg">
          {backend.error ?? failed}
        </p>
      ) : null}
      {owed === 0n ? null : (
        <p className="mt-auto pt-4 text-center text-[12px] text-muted">
          What you owe is fixed in dollars. In rupiah it moves with the rate, so it can cost a
          little more or less than when you spent it. Interest-free either way.
        </p>
      )}
    </div>
  );
}

function Option({
  title,
  body,
  busy,
  disabled,
  onClick,
}: {
  title: string;
  body: string;
  busy: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center justify-between gap-3 rounded-[22px] border border-line bg-card px-5 py-4 text-left disabled:opacity-50"
    >
      <span>
        <span className="block text-[15px] font-semibold">{title}</span>
        <span className="mt-0.5 block text-[12.5px] text-muted">{body}</span>
      </span>
      {busy ? <Spinner /> : <span aria-hidden="true">›</span>}
    </button>
  );
}
