"use client";
import { useEffect, useState } from "react";
import { LimitBreakdown } from "../../../components/home/LimitBreakdown";
import { Card, CopyButton } from "../../../components/ui";
import { RecordView } from "../../../components/verify/RecordView";
import { useCredit } from "../../../hooks/useCredit";
import { useFx } from "../../../hooks/useFx";
import { useMe } from "../../../hooks/useMe";
import { useVerifyRecord } from "../../../hooks/useVerifyRecord";
import { useWallet } from "../../../hooks/useWallet";
import { localFor } from "../../../lib/matocard/local";

/** A unix-seconds timestamp as "3 Nov". Formatted after mount only, where the screen renders. */
const day = (seconds: bigint) =>
  new Date(Number(seconds) * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

/**
 * The Credit tab: your own record, exactly as anyone else sees it at `/verify/<account>`, and the
 * link to share it. The record is the product (PLAN §2): it is yours, anyone can check it, and it
 * still counts when you move home. Under it, how that record turns into a limit (PLAN §3: always
 * show why), read live from the chain.
 */
export default function CreditPage() {
  const { address } = useWallet();
  const { record, loading, error } = useVerifyRecord(address);
  // The origin is read after mount, so the server never renders a link to the wrong host.
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  const link = address && origin ? `${origin}/verify/${address}` : "";
  const credit = useCredit();
  const me = useMe();
  const local = localFor(me.country);
  const { rate } = useFx(local.pair);
  // The clock is read after mount: a card top-up's hold ends at a time.
  const [now, setNow] = useState<bigint>();
  useEffect(() => setNow(BigInt(Math.floor(Date.now() / 1000))), []);
  const pending = credit.collateral;
  const heldUntil =
    now !== undefined && pending && pending.pendingShares > 0n && pending.pendingUntil > now
      ? day(pending.pendingUntil)
      : null;

  return (
    <div className="stagger pb-8">
      <h1 className="mb-4 mt-2 text-[24px] font-semibold tracking-[-0.02em]">Your credit record</h1>
      <RecordView record={record} loading={loading} error={error} />
      {credit.verified ? (
        <LimitBreakdown
          className="mt-3"
          collateral={credit.collateral?.value}
          score={credit.score}
          ratioBps={credit.ratioBps}
          limit={credit.limit}
          yieldEarned={me.collateral?.yield}
          heldUntil={heldUntil}
          rate={rate}
          currency={local.currency}
        />
      ) : null}
      {link ? (
        <Card className="mt-3 flex items-center justify-between gap-3 px-5 py-4">
          <div className="min-w-0">
            <div className="text-[14.5px] font-semibold">Share your record</div>
            <div className="truncate font-mono text-[12px] text-muted">{link}</div>
          </div>
          <CopyButton value={link} label="Copy link to your record" />
        </Card>
      ) : null}
    </div>
  );
}
