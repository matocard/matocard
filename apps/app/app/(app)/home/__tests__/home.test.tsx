import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render as rtlRender, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import HomePage from "../page";

/**
 * Home on Matocard's own data: the chain (`useCredit`), the backend (`useMe`) and one display rate
 * (`useFx`). What these pin is PLAN §3 step 4: the headline in rupiah with the AUSD row under it,
 * the limit always explained, and debt in its dollar value with a way to settle.
 */

const render = (ui: React.ReactNode) =>
  rtlRender(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {ui}
    </QueryClientProvider>,
  );

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, back: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/home",
  useSearchParams: () => new URLSearchParams(""),
}));
vi.mock("../../../../hooks/useIsDesktop", () => ({ useIsDesktop: () => false }));

const credit = vi.fn();
vi.mock("../../../../hooks/useCredit", () => ({ useCredit: () => credit() }));
const me = vi.fn();
vi.mock("../../../../hooks/useMe", () => ({ useMe: () => me() }));
// PLAN §3's rates: 100 AUSD reads Rp 1,600,000 or RM 400.00.
vi.mock("../../../../hooks/useFx", () => ({
  useFx: (pair: string) => ({ rate: pair === "USD/MYR" ? "4" : "16000" }),
}));
const setCountry = vi.fn();
vi.mock("../../../../lib/matocard/backend", async (original) => ({
  ...(await original<typeof import("../../../../lib/matocard/backend")>()),
  setCountry: (...a: unknown[]) => setCountry(...a),
}));
vi.mock("../../../../hooks/useMyActivity", () => ({
  useMyActivity: () => ({ items: [], loading: false, indexerDown: false }),
}));

/** The demo account at score 0: 150 AUSD of collateral, limit and available 100. */
const verifiedCredit = (over: Record<string, unknown> = {}) => ({
  loading: false,
  refresh: vi.fn(),
  verified: true,
  score: 0n,
  ratioBps: 15_000n,
  limit: 100_000_000n,
  available: 100_000_000n,
  drawn: 0n,
  dueAt: 0n,
  collateral: { value: 150_000_000n, shares: 150_000_000n, pendingShares: 0n, pendingUntil: 0n },
  ausdBalance: 0n,
  ...over,
});

const meState = (over: Record<string, unknown> = {}) => ({
  session: { wallet: "0xA11CE", until: 9_999_999_999, signature: "0x" },
  signIn: vi.fn(),
  signingIn: false,
  refresh: vi.fn(),
  kyc: "approved",
  country: "ID",
  cardNumber: "9924123412341234",
  collateral: { yield: 0n },
  ...over,
});

beforeEach(() => {
  push.mockReset();
  credit.mockReturnValue(verifiedCredit());
  me.mockReturnValue(meState());
});

test("the headline is what the card can spend, in rupiah, with the AUSD row under it", () => {
  render(<HomePage />);
  expect(screen.getByText("Available")).toBeInTheDocument();
  expect(screen.getByText("≈ Rp 1,600,000")).toBeInTheDocument();
  expect(screen.getByText("100.00 USD · AUSD")).toBeInTheDocument();
});

test("the limit is explained: collateral, score, ratio, limit", () => {
  render(<HomePage />);
  const card = screen.getByText("Why your limit is this").closest("div") as HTMLElement;
  expect(within(card).getByText("150.00 USD")).toBeInTheDocument();
  expect(within(card).getByText("0 of 100")).toBeInTheDocument();
  expect(within(card).getByText("150%")).toBeInTheDocument();
  expect(within(card).getByText("100.00 USD")).toBeInTheDocument();
});

test("nothing owed: Send and Top up, no Settle", async () => {
  render(<HomePage />);
  expect(screen.getByRole("button", { name: "Send" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "Top up" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Settle" })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Top up" }));
  expect(push).toHaveBeenCalledWith("/topup");
});

test("a balance owed shows in dollars, and Settle leads to settling", async () => {
  credit.mockReturnValue(verifiedCredit({ drawn: 50_000_000n, available: 50_000_000n }));
  render(<HomePage />);
  expect(screen.getByText("50.00 USD")).toBeInTheDocument();
  const settles = screen.getAllByRole("button", { name: "Settle" });
  expect(settles.length).toBe(2); // the action pill and the owed card
  await userEvent.click(settles[0] as HTMLElement);
  expect(push).toHaveBeenCalledWith("/settle");
});

test("an unread figure is a dash, never a zero", () => {
  credit.mockReturnValue(verifiedCredit({ available: undefined }));
  render(<HomePage />);
  expect(screen.getByText("—")).toBeInTheDocument();
  expect(screen.queryByText(/0\.00 USD · AUSD/)).not.toBeInTheDocument();
});

test("before verification, the card is not issued and the next step is offered", async () => {
  const signIn = vi.fn();
  credit.mockReturnValue(verifiedCredit({ verified: false }));
  me.mockReturnValue(meState({ session: null, kyc: undefined, signIn }));
  render(<HomePage />);
  expect(screen.getByText("Not issued yet")).toBeInTheDocument();
  // The card itself, blurred, carries the step that activates it.
  expect(screen.getByRole("region", { name: "Your card, not issued yet" })).toBeInTheDocument();
  expect(screen.getByText("Activate your card")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Send" })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Continue" }));
  expect(signIn).toHaveBeenCalled();
});

test("a verification in progress says so instead of asking again", () => {
  credit.mockReturnValue(verifiedCredit({ verified: false }));
  me.mockReturnValue(meState({ kyc: "pending" }));
  render(<HomePage />);
  expect(screen.getByText("Checking your identity")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Verify identity" })).not.toBeInTheDocument();
});

test("money received shows as a balance, in AUSD on the detail row", () => {
  credit.mockReturnValue(verifiedCredit({ ausdBalance: 50_000_000n }));
  render(<HomePage />);
  expect(screen.getByText("Balance")).toBeInTheDocument();
  expect(screen.getByText("50.00 USD · AUSD")).toBeInTheDocument();
  expect(screen.getByText("≈ Rp 800,000")).toBeInTheDocument();
});

test("someone in Malaysia reads the headline in ringgit", () => {
  me.mockReturnValue(meState({ country: "MY" }));
  render(<HomePage />);
  expect(screen.getByText("≈ RM 400.00")).toBeInTheDocument();
  expect(screen.getByText("100.00 USD · AUSD")).toBeInTheDocument();
});

test("a signed-in account that has not said where it lives is asked, and the answer is saved", async () => {
  const refresh = vi.fn();
  credit.mockReturnValue(verifiedCredit({ verified: false }));
  me.mockReturnValue(meState({ country: null, kyc: "none", refresh }));
  render(<HomePage />);
  expect(screen.getByText("Where do you live?")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Malaysia" }));
  expect(setCountry).toHaveBeenCalledWith(expect.objectContaining({ wallet: "0xA11CE" }), "MY");
  expect(refresh).toHaveBeenCalled();
});
