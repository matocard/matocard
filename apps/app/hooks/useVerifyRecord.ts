"use client";
import { useQuery } from "@tanstack/react-query";
import { isAddress } from "viem";
import { getVerifyRecord } from "../lib/matocard/backend";

/** `GET /verify/:wallet`: a public credit record, nothing personal (PLAN §3 step 7). */
export function useVerifyRecord(wallet: string | null | undefined) {
  const valid = Boolean(wallet && isAddress(wallet));
  const query = useQuery({
    queryKey: ["matocard", "verify", wallet?.toLowerCase()],
    queryFn: () => getVerifyRecord(wallet as string),
    enabled: valid,
  });
  return {
    record: query.data,
    loading: valid && query.isLoading,
    error: valid ? query.error?.message : wallet ? "That is not a Matocard account." : undefined,
  };
}
