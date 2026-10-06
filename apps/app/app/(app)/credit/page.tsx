"use client";
import { useEffect, useState } from "react";
import { Card, CopyButton } from "../../../components/ui";
import { RecordView } from "../../../components/verify/RecordView";
import { useVerifyRecord } from "../../../hooks/useVerifyRecord";
import { useWallet } from "../../../hooks/useWallet";

/**
 * The Credit tab: your own record, exactly as anyone else sees it at `/verify/<account>`, and the
 * link to share it. The record is the product (PLAN §2): it is yours, anyone can check it, and it
 * still counts when you move home.
 */
export default function CreditPage() {
  const { address } = useWallet();
  const { record, loading, error } = useVerifyRecord(address);
  // The origin is read after mount, so the server never renders a link to the wrong host.
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  const link = address && origin ? `${origin}/verify/${address}` : "";

  return (
    <div className="stagger pb-8">
      <h1 className="mb-4 mt-2 text-[24px] font-semibold tracking-[-0.02em]">Your credit record</h1>
      <RecordView record={record} loading={loading} error={error} />
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
