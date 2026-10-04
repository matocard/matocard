"use client";
import { useParams } from "next/navigation";
import { RecordView } from "../../../components/verify/RecordView";
import { useVerifyRecord } from "../../../hooks/useVerifyRecord";

/**
 * The public credit record (PLAN §3 step 7, §8 `/verify/:id`): open to anyone, no sign-in, no
 * personal data. A bank in Indonesia can read the same record when Siti moves home.
 */
export default function VerifyPage() {
  const { id } = useParams<{ id: string }>();
  const { record, loading, error } = useVerifyRecord(id);
  return (
    <main className="mx-auto w-full max-w-[480px] px-4 py-8">
      <div className="mb-5 flex items-center gap-2.5">
        {/* biome-ignore lint/performance/noImgElement: a 24px static mark */}
        <img src="/brand/matocard-logo.png" alt="" width={24} height={24} className="h-6 w-6" />
        <span className="text-[17px] font-bold tracking-[-0.02em]">Matocard</span>
      </div>
      <h1 className="text-[24px] font-semibold tracking-[-0.02em]">Credit record</h1>
      <p className="mb-4 mt-1 break-all font-mono text-[12.5px] text-muted">{id}</p>
      <RecordView record={record} loading={loading} error={error} />
    </main>
  );
}
