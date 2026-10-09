import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TopUpScreen } from "../TopUpScreen";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), back: vi.fn() }) }));

const credit = vi.fn();
vi.mock("../../../hooks/useCredit", () => ({ useCredit: () => credit() }));
vi.mock("../../../hooks/useFx", () => ({
  useFx: (pair: string) => ({ rate: pair === "USD/MYR" ? "4" : "16000" }),
}));
const me = vi.fn();
vi.mock("../../../hooks/useMe", () => ({ useMe: () => me() }));
vi.mock("../../../hooks/useMyActivity", () => ({ useMyActivity: () => ({ items: [] }) }));
const session = { wallet: "0xA11CE", until: 9_999_999_999, signature: "0x5" };
vi.mock("../../../hooks/useSession", () => ({
  useSession: () => ({ session, signIn: vi.fn(async () => session) }),
}));

const getQuote = vi.fn();
const startTopUp = vi.fn();
vi.mock("../../../lib/matocard/backend", () => ({
  getQuote: (...a: unknown[]) => getQuote(...a),
  startTopUp: (...a: unknown[]) => startTopUp(...a),
}));

const type = async (digits: string) => {
  for (const d of digits) await userEvent.click(screen.getByRole("button", { name: d }));
};

beforeEach(() => {
  // A new account: deposit needed 150% of the limit.
  credit.mockReturnValue({ verified: true, ratioBps: 15_000n });
  me.mockReturnValue({ country: "ID" });
  getQuote.mockResolvedValue({ id: "q-1", pair: "USD/IDR", rate: "16000", expiresAt: "" });
  startTopUp.mockResolvedValue({
    paymentId: "p-1",
    checkoutUrl: "https://checkout.example/p-1",
    fiat: "2400000",
    ausd: "150000000",
  });
  vi.spyOn(window, "open").mockReturnValue(null);
});

test("below Rp 10,000 there is nothing to pay", async () => {
  render(<TopUpScreen />);
  await type("5000");
  expect(screen.getByText("The smallest top-up is Rp 10,000")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /^Pay/ })).toBeDisabled();
});

test("before paying, it says how much of the top-up can be spent", async () => {
  render(<TopUpScreen />);
  expect(screen.getByText("The money you add sets how much you can spend.")).toBeInTheDocument();
  await type("2400000");
  // Rp 2,400,000 is 150 USD of deposit; at 150% that is 100 USD to spend.
  expect(screen.getByText("You'll be able to spend ≈ Rp 1,600,000 of it")).toBeInTheDocument();
});

test("a better score means more of the same top-up can be spent", async () => {
  credit.mockReturnValue({ verified: true, ratioBps: 8_000n });
  render(<TopUpScreen />);
  await type("2400000");
  expect(screen.getByText("You'll be able to spend ≈ Rp 3,000,000 of it")).toBeInTheDocument();
});

test("paying locks a fresh USD/IDR quote, starts the top-up and opens the checkout", async () => {
  render(<TopUpScreen />);
  await type("2400000");
  await userEvent.click(screen.getByRole("button", { name: "Pay Rp 2,400,000" }));
  await waitFor(() => expect(screen.getByText("Finish paying in the new tab")).toBeInTheDocument());
  expect(getQuote).toHaveBeenCalledWith("USD/IDR");
  expect(startTopUp).toHaveBeenCalledWith(session, {
    amount: "2400000",
    method: "bank",
    quoteId: "q-1",
  });
  expect(window.open).toHaveBeenCalledWith("https://checkout.example/p-1", "_blank", "noopener");
});

test("a card top-up says it waits out a hold", async () => {
  render(<TopUpScreen />);
  await userEvent.click(screen.getByRole("button", { name: "Card" }));
  expect(screen.getByText(/counts after a short hold/)).toBeInTheDocument();
});

test("the backend's refusal is shown as it said it", async () => {
  startTopUp.mockRejectedValue(new Error("verify your identity first"));
  render(<TopUpScreen />);
  await type("50000");
  await userEvent.click(screen.getByRole("button", { name: "Pay Rp 50,000" }));
  await waitFor(() => expect(screen.getByText("verify your identity first")).toBeInTheDocument());
});

test("before verification there is no card to top up", () => {
  credit.mockReturnValue({ verified: false });
  render(<TopUpScreen />);
  expect(screen.getByText("Verify your identity first")).toBeInTheDocument();
});

test("in Malaysia it is ringgit: typed in RM, sent in sen, on a USD/MYR quote, by FPX", async () => {
  me.mockReturnValue({ country: "MY" });
  render(<TopUpScreen />);
  expect(screen.getByRole("button", { name: "FPX" })).toBeInTheDocument();
  await type("600");
  expect(screen.getByText("You'll be able to spend ≈ RM 400.00 of it")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Pay RM 600.00" }));
  await waitFor(() => expect(startTopUp).toHaveBeenCalled());
  expect(getQuote).toHaveBeenCalledWith("USD/MYR");
  expect(startTopUp).toHaveBeenCalledWith(session, {
    amount: "60000",
    method: "bank",
    quoteId: "q-1",
  });
});

test("ringgit below RM 5 is refused before it reaches the backend", async () => {
  me.mockReturnValue({ country: "MY" });
  render(<TopUpScreen />);
  await type("4");
  expect(screen.getByText("The smallest top-up is RM 5.00")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /^Pay/ })).toBeDisabled();
});
