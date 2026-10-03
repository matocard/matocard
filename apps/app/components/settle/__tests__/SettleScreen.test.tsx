import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettleScreen } from "../SettleScreen";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), back: vi.fn() }) }));
vi.mock("../../../hooks/useFx", () => ({ useFx: () => ({ rate: "16000" }) }));
const session = { wallet: "0xA11CE", until: 9_999_999_999, signature: "0x5" };
vi.mock("../../../hooks/useSession", () => ({
  useSession: () => ({ session, signIn: vi.fn(async () => session) }),
}));
const credit = vi.fn();
vi.mock("../../../hooks/useCredit", () => ({ useCredit: () => credit() }));
const getQuote = vi.fn();
const startSettlement = vi.fn();
vi.mock("../../../lib/matocard/backend", () => ({
  getQuote: (...a: unknown[]) => getQuote(...a),
  startSettlement: (...a: unknown[]) => startSettlement(...a),
}));

const HASH = `0x${"ab".repeat(32)}` as const;
const repay = vi.fn();
const repayFromCollateral = vi.fn();
const owing = (over: Record<string, unknown> = {}) => ({
  drawn: 50_000_000n,
  ausdBalance: 0n,
  collateral: { value: 150_000_000n },
  repay,
  repayFromCollateral,
  ...over,
});

beforeEach(() => {
  credit.mockReturnValue(owing());
  repay.mockResolvedValue(HASH);
  repayFromCollateral.mockResolvedValue(HASH);
  getQuote.mockResolvedValue({ id: "q-2", pair: "USD/IDR", rate: "16000", expiresAt: "" });
  startSettlement.mockResolvedValue({
    paymentId: "p-2",
    checkoutUrl: "https://checkout.example/p-2",
    fiat: "800000",
    ausd: "50000000",
  });
  vi.spyOn(window, "open").mockReturnValue(null);
});

test("the debt is shown in dollars, with what it is in rupiah today", () => {
  render(<SettleScreen />);
  expect(screen.getByText("50.00 USD")).toBeInTheDocument();
  expect(screen.getByText("≈ Rp 800,000 today")).toBeInTheDocument();
});

test("paying in rupiah locks a fresh quote and opens the checkout", async () => {
  render(<SettleScreen />);
  await userEvent.click(screen.getByRole("button", { name: /Pay in rupiah/ }));
  await waitFor(() => expect(screen.getByText("Finish paying in the new tab")).toBeInTheDocument());
  expect(getQuote).toHaveBeenCalledWith("USD/IDR");
  expect(startSettlement).toHaveBeenCalledWith(session, "q-2");
  expect(window.open).toHaveBeenCalledWith("https://checkout.example/p-2", "_blank", "noopener");
});

test("paying from the balance is offered only when the balance covers the debt", async () => {
  render(<SettleScreen />);
  expect(screen.getByRole("button", { name: /Pay from your balance/ })).toBeDisabled();
});

test("with enough balance, it repays onchain and confirms", async () => {
  credit.mockReturnValue(owing({ ausdBalance: 60_000_000n }));
  render(<SettleScreen />);
  await userEvent.click(screen.getByRole("button", { name: /Pay from your balance/ }));
  await waitFor(() => expect(screen.getByText(/Settled\./)).toBeInTheDocument());
  expect(repay).toHaveBeenCalledWith();
});

test("collateral can settle it, and a refusal from the wallet is shown", async () => {
  repayFromCollateral.mockRejectedValue(new Error("User rejected the request.\nDetails: …"));
  render(<SettleScreen />);
  await userEvent.click(screen.getByRole("button", { name: /Use your collateral/ }));
  await waitFor(() => expect(screen.getByText("User rejected the request.")).toBeInTheDocument());
  expect(repayFromCollateral).toHaveBeenCalled();
});

test("nothing owed, nothing to settle", () => {
  credit.mockReturnValue(owing({ drawn: 0n }));
  render(<SettleScreen />);
  expect(screen.getByText("Nothing is owed.")).toBeInTheDocument();
});
