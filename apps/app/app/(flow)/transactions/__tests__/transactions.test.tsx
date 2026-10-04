import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TransactionsPage from "../page";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), back: vi.fn() }) }));

const activity = vi.fn();
vi.mock("../../../../hooks/useMyActivity", () => ({ useMyActivity: () => activity() }));

/** One row of each group, shaped the way `useMyActivity` emits them. */
const ROWS = [
  {
    id: 0,
    cat: "you",
    kind: "settled",
    group: "card",
    when: "1m ago",
    detail: "50.00 AUSD",
    href: "https://testnet.monadvision.com/tx/0xrepay",
  },
  {
    id: 1,
    cat: "you",
    kind: "sent",
    group: "card",
    when: "3m ago",
    detail: "50.00 AUSD to 0xcC9c…106b",
    href: "https://testnet.monadvision.com/tx/0xdraw",
  },
  {
    id: 2,
    cat: "you",
    kind: "topup",
    group: "deposit",
    when: "8m ago",
    detail: "+150.00 AUSD",
    href: "https://testnet.monadvision.com/tx/0xtopup",
  },
];

beforeEach(() => {
  activity.mockReturnValue({ loading: false, items: ROWS, indexerDown: false });
});

test("every row shows under All", () => {
  render(<TransactionsPage />);
  expect(screen.getByText("Settled")).toBeInTheDocument();
  expect(screen.getByText("Sent")).toBeInTheDocument();
  expect(screen.getByText("Top-up")).toBeInTheDocument();
});

test("Card and Top-ups split the rows by what they were", async () => {
  render(<TransactionsPage />);
  await userEvent.click(screen.getByRole("button", { name: "Top-ups" }));
  expect(screen.getByText("Top-up")).toBeInTheDocument();
  expect(screen.queryByText("Sent")).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Card" }));
  expect(screen.getByText("Sent")).toBeInTheDocument();
  expect(screen.queryByText("Top-up")).not.toBeInTheDocument();
});

test("an empty history says what will show there", () => {
  activity.mockReturnValue({ loading: false, items: [], indexerDown: false });
  render(<TransactionsPage />);
  expect(screen.getByText("Nothing yet")).toBeInTheDocument();
});

test("a down indexer reads as catching up, not as no history", () => {
  activity.mockReturnValue({ loading: false, items: [], indexerDown: true });
  render(<TransactionsPage />);
  expect(screen.getByText("History is catching up")).toBeInTheDocument();
});
