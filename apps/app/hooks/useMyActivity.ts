"use client";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { relativeTime } from "../lib/activity/map";
import type { ActivityItem } from "../lib/matocard/activity";
import { type ActivityRow, big, getMyActivity, type InFlightRow } from "../lib/matocard/backend";
import { explorerTx } from "../lib/matocard/monad";
import { formatAusd, formatIdr } from "../lib/matocard/money";
import { pollInterval } from "../lib/matocard/polling";
import { useSession } from "./useSession";

const short = (a: string | null) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");
const ausd = (v: string | null) => (v === null ? "" : `${formatAusd(BigInt(v))} AUSD`);

/** What each indexed event is called on screen. Wording is Axel's to change. */
function describe(
  row: ActivityRow,
): { kind: string; detail: string; group: "card" | "deposit" } | null {
  switch (row.kind) {
    case "TopUp":
      return {
        kind: row.method === "Card" ? "Top-up, on hold" : "Top-up",
        detail: `+${ausd(row.amount)}`,
        group: "deposit",
      };
    case "TopUpCleared":
      return { kind: "Top-up cleared", detail: "Now counts toward your limit", group: "deposit" };
    case "TopUpReversed":
      return { kind: "Top-up reversed", detail: "Refunded to the card", group: "deposit" };
    case "Draw":
      return {
        kind: "Sent",
        detail: `${ausd(row.amount)} to ${short(row.counterparty)}`,
        group: "card",
      };
    case "Repay":
      return { kind: "Settled", detail: ausd(row.amount), group: "card" };
    case "CollateralWithdrawn":
      return { kind: "Collateral taken out", detail: ausd(row.amount), group: "deposit" };
    case "Verified":
      return { kind: "Identity verified", detail: "Your card is ready", group: "card" };
    case "Default":
      return { kind: "Missed the due date", detail: "Settled from collateral", group: "card" };
    default:
      // The yield fee is bookkeeping between the vault and the pool, not something the user did.
      return null;
  }
}

function describeInFlight(row: InFlightRow): { kind: string; detail: string } {
  const fiat = row.currency === "IDR" ? formatIdr(BigInt(row.fiat)) : `${row.fiat} ${row.currency}`;
  if (row.kind === "cashout") return { kind: "Cash out to bank", detail: `${fiat}, on its way` };
  const what = row.kind === "repay" ? "Settlement" : "Top-up";
  return row.status === "PENDING"
    ? { kind: what, detail: `${fiat}, waiting for payment` }
    : { kind: what, detail: `${fiat}, paid, crediting now` };
}

/**
 * History (PLAN §8): what the indexer saw for this account, plus what the backend holds that is
 * not onchain yet (`inFlight`). If the indexer is down the screen still shows the rest, and says
 * so through `indexerDown` instead of claiming there is no history.
 */
export function useMyActivity() {
  const { session } = useSession();
  // Relative times need a clock, and the clock is read after mount (never during render).
  const [now, setNow] = useState<number>();
  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const query = useQuery({
    queryKey: ["matocard", "activity", session?.wallet],
    queryFn: () => getMyActivity(session!),
    enabled: Boolean(session),
    refetchInterval: (q) => pollInterval((q.state.data?.inFlight.length ?? 0) > 0),
  });

  const items: ActivityItem[] = [];
  let id = 0;
  for (const row of query.data?.inFlight ?? []) {
    const at = Date.parse(row.createdAt);
    items.push({
      id: id++,
      cat: "you",
      ...describeInFlight(row),
      at,
      when: now ? relativeTime(at, now) : "",
      flag: true,
      group: row.kind === "cashout" ? "card" : "deposit",
    });
  }
  for (const row of query.data?.activity ?? []) {
    const shown = describe(row);
    if (!shown) continue;
    const at = Number(big(row.timestamp) ?? 0n) * 1000;
    items.push({
      id: id++,
      cat: "you",
      ...shown,
      at,
      when: now ? relativeTime(at, now) : "",
      href: explorerTx(row.txHash),
    });
  }

  return {
    items,
    loading: Boolean(session) && query.isLoading,
    error: query.error?.message,
    indexerDown: query.data?.indexer === "unavailable",
  };
}
