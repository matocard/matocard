import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ActivityItem } from "../../../lib/matocard/activity";
import { ActivityList } from "../ActivityList";

/** The list renders the kinds `useMyActivity` emits, titled in `ActivityRow`. */

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 8, 13, 12, 0, 0);

const row = (over: Partial<ActivityItem> & Pick<ActivityItem, "id" | "kind">): ActivityItem => ({
  cat: "you",
  detail: "",
  when: "",
  ...over,
});

test("words each kind for someone who has held a debit card", () => {
  render(
    <ActivityList
      items={[
        row({ id: 1, kind: "sent", detail: "50.00 AUSD to 0xcC9c…106b" }),
        row({ id: 2, kind: "topup-held", detail: "+150.00 AUSD" }),
        row({ id: 3, kind: "settled", detail: "50.00 AUSD" }),
        row({ id: 4, kind: "cashout", detail: "Rp 800,000, on its way" }),
      ]}
    />,
  );

  // No chain words in a title.
  expect(screen.getByText("Sent")).toBeInTheDocument();
  expect(screen.getByText("Top-up, on hold")).toBeInTheDocument();
  expect(screen.getByText("Settled")).toBeInTheDocument();
  expect(screen.getByText("Cash out to bank")).toBeInTheDocument();
  expect(screen.queryByText(/wallet|gas|chain|token/i)).toBeNull();
});

test("an unknown kind shows its detail rather than inventing a title", () => {
  render(<ActivityList items={[row({ id: 1, kind: "something-new", detail: "42 AUSD moved" })]} />);

  expect(screen.getByText("42 AUSD moved")).toBeInTheDocument();
});

test("grouped: splits by day and names today and yesterday", () => {
  render(
    <ActivityList
      grouped
      now={NOW}
      items={[
        row({ id: 1, kind: "sent", detail: "a", at: NOW - 3_600_000 }),
        row({ id: 2, kind: "settled", detail: "b", at: NOW - DAY }),
        row({ id: 3, kind: "settled", detail: "c", at: NOW - 5 * DAY }),
      ]}
    />,
  );

  expect(screen.getByText("Today")).toBeInTheDocument();
  expect(screen.getByText("Yesterday")).toBeInTheDocument();
  // Older than that gets a date, and no year because it is this one. "Sep 8" rather than "8 Sep":
  // en-US month-first, which is also what the reference app this was modelled on shows.
  expect(screen.getByText("Sep 8")).toBeInTheDocument();
});

test("grouped: two rows on the same day share one heading", () => {
  render(
    <ActivityList
      grouped
      now={NOW}
      items={[
        row({ id: 1, kind: "sent", detail: "a", at: NOW - 3_600_000 }),
        row({ id: 2, kind: "settled", detail: "b", at: NOW - 7_200_000 }),
      ]}
    />,
  );

  expect(screen.getAllByText("Today")).toHaveLength(1);
});

test("grouped needs a clock, and renders flat without one", () => {
  // `now` is read after mount, so the first paint has none. Deciding "Today" during render would
  // bake the server's clock into the HTML.
  render(
    <ActivityList
      grouped
      now={null}
      items={[row({ id: 1, kind: "sent", detail: "a", at: NOW })]}
    />,
  );

  expect(screen.queryByText("Today")).toBeNull();
  expect(screen.getByText("Sent")).toBeInTheDocument();
});

test("renders a designed empty state when empty copy is provided", () => {
  render(
    <ActivityList
      items={[]}
      emptyTitle="Nothing yet"
      emptyDescription="Top up and everything that follows will show here."
    />,
  );

  expect(screen.getByText("Nothing yet")).toBeInTheDocument();
});

test("pageSize shows a page and a Load more that grows it", async () => {
  const user = userEvent.setup();
  const items = Array.from({ length: 7 }, (_, i) =>
    row({ id: i, kind: "sent", detail: `row ${i}` }),
  );
  render(<ActivityList items={items} pageSize={3} />);

  expect(screen.getAllByText("Sent")).toHaveLength(3);
  await user.click(screen.getByRole("button", { name: /Load more/ }));
  expect(screen.getAllByText("Sent")).toHaveLength(6);
  // The last page is short, and the button goes once there is nothing left behind it.
  await user.click(screen.getByRole("button", { name: /Load more/ }));
  expect(screen.getAllByText("Sent")).toHaveLength(7);
  expect(screen.queryByRole("button", { name: /Load more/ })).toBeNull();
});

test("no pageSize means no button, however long the list", () => {
  render(
    <ActivityList
      items={Array.from({ length: 20 }, (_, i) => row({ id: i, kind: "sent", detail: `r${i}` }))}
    />,
  );

  expect(screen.queryByRole("button", { name: /Load more/ })).toBeNull();
  expect(screen.getAllByText("Sent")).toHaveLength(20);
});

test("a card top-up on hold and its clearing read as one top-up at two moments", () => {
  render(
    <ActivityList
      items={[
        row({ id: 1, kind: "topup-cleared", detail: "Now counts toward your limit" }),
        row({ id: 2, kind: "topup-held", detail: "+150.00 AUSD" }),
      ]}
    />,
  );

  expect(screen.getByText("Top-up, on hold")).toBeInTheDocument();
  expect(screen.getByText("Top-up cleared")).toBeInTheDocument();
});
