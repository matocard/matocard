"use client";
import { useEffect, useState } from "react";
import { ActivityList } from "../../../components/activity/ActivityList";
import { SlidingTabs, SubHeader, TabPanel } from "../../../components/ui";
import { useMyActivity } from "../../../hooks/useMyActivity";

/**
 * History (PLAN §8): everything that happened to this account, newest first, from the indexer
 * plus what the backend holds that is not settled yet (`useMyActivity`). If the indexer is down
 * the rest still shows, and the empty state says history is catching up rather than empty.
 */
const FILTERS = [
  { key: "all", label: "All" },
  { key: "card", label: "Card" },
  { key: "deposit", label: "Top-ups" },
] as const;

type FilterKey = (typeof FILTERS)[number]["key"];

const EMPTY_COPY: Record<FilterKey, { title: string; description: string }> = {
  all: {
    title: "Nothing yet",
    description: "Top up and everything that follows will show here.",
  },
  card: {
    title: "Nothing sent yet",
    description: "What you send and settle will show here.",
  },
  deposit: {
    title: "No top-ups yet",
    description: "Money you top up becomes your collateral, and shows here.",
  },
};

export default function TransactionsPage() {
  const { loading, items, indexerDown } = useMyActivity();
  const [filter, setFilter] = useState<FilterKey>("all");
  // Read after mount, never during render: deciding "Today" while rendering bakes the server's
  // clock into the HTML and makes the first client paint disagree with it.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    // Through a frame rather than synchronously: setting state inside an effect body cascades a
    // render, and the lint rule that catches it is right. Same shape as CreditScreen.
    const frame = requestAnimationFrame(() => setNow(Date.now()));
    return () => cancelAnimationFrame(frame);
  }, []);

  const shown = filter === "all" ? items : items.filter((item) => item.group === filter);
  const empty = EMPTY_COPY[filter];

  return (
    <div className="pb-8">
      <div className="stagger">
        <SubHeader title="Transactions" />
        <SlidingTabs
          options={FILTERS}
          value={filter}
          onChange={setFilter}
          label="Filter transactions"
          className="mb-3.5"
        />
        {/* The full history is the one place day headings earn their space: it is long, and "3h ago"
            stops being useful the moment the list runs past yesterday. The three-row previews on
            Home stay ungrouped. */}
        {/* Keyed on the filter so the panel remounts and cross-fades. Without the key the rows
            swap in place and the change reads as the list glitching rather than as a new list. */}
        <TabPanel key={filter}>
          <ActivityList
            items={shown}
            loading={loading}
            grouped
            now={now}
            pageSize={12}
            emptyTitle={indexerDown ? "History is catching up" : empty.title}
            emptyDescription={
              indexerDown ? "Payments still in progress are shown." : empty.description
            }
          />
        </TabPanel>
      </div>
    </div>
  );
}
