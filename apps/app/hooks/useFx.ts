"use client";
import { useQuery } from "@tanstack/react-query";
import { getQuote, type Pair } from "../lib/matocard/backend";

/**
 * A display rate for "≈" figures. Each call to `/quote` locks a fresh 60-second quote, which is
 * what a top-up or settlement must use (ask for one at that moment); this one only paints
 * headlines, so it is shared and refreshed once a minute.
 */
export function useFx(pair: Pair = "USD/IDR") {
  const query = useQuery({
    queryKey: ["matocard", "fx", pair],
    queryFn: () => getQuote(pair),
    staleTime: 55_000,
    refetchInterval: 60_000,
  });
  return { rate: query.data?.rate, loading: query.isLoading, error: query.error?.message };
}
