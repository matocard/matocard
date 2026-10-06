import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CashoutScreen } from "../CashoutScreen";

const MOM = "0xcC9c84AF69ff5aD646a6fdCD02D092ee69C6106b";
const TREASURY = "0xcf330A7E5D4eae35250f00B4af96eBcf38347Df1";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), back: vi.fn() }) }));
vi.mock("wagmi", () => ({ useConfig: () => ({}) }));
vi.mock("../../../hooks/useWallet", () => ({ useWallet: () => ({ address: MOM }) }));
vi.mock("../../../hooks/useFx", () => ({ useFx: () => ({ rate: "16000" }) }));
const session = { wallet: MOM, until: 9_999_999_999, signature: "0x5" };
vi.mock("../../../hooks/useSession", () => ({
  useSession: () => ({ session, signIn: vi.fn(async () => session) }),
}));
const credit = vi.fn();
vi.mock("../../../hooks/useCredit", () => ({ useCredit: () => credit() }));
const signTransfer = vi.fn();
vi.mock("../../../lib/matocard/authorization", () => ({
  signTransfer: (...a: unknown[]) => signTransfer(...a),
}));
const getQuote = vi.fn();
const startCashout = vi.fn();
vi.mock("../../../lib/matocard/backend", () => ({
  TREASURY: "0xcf330A7E5D4eae35250f00B4af96eBcf38347Df1",
  getQuote: (...a: unknown[]) => getQuote(...a),
  startCashout: (...a: unknown[]) => startCashout(...a),
}));

const type = async (digits: string) => {
  for (const d of digits) await userEvent.click(screen.getByRole("button", { name: d }));
};
const fillBank = async (account = "1234567890") => {
  await userEvent.type(screen.getByLabelText("Account number"), account);
  await userEvent.type(screen.getByLabelText("Name on the account"), "Ibu Sri");
};

beforeEach(() => {
  vi.clearAllMocks();
  credit.mockReturnValue({ ausdBalance: 263_490_089n });
  getQuote.mockResolvedValue({ id: "q-3", pair: "USD/IDR", rate: "16000", expiresAt: "" });
  signTransfer.mockResolvedValue({ from: MOM, to: TREASURY, value: "50000000" });
  startCashout.mockResolvedValue({ payoutId: "o-1", ausd: "50000000", fiat: "800000" });
});

test("50 USD from the balance pays Rp 800,000 to Mom's bank", async () => {
  render(<CashoutScreen />);
  await type("50");
  expect(screen.getByText("≈ Rp 800,000 to your bank")).toBeInTheDocument();
  await fillBank();
  await userEvent.click(screen.getByRole("button", { name: "Cash out" }));
  await waitFor(() => expect(screen.getByText("Rp 800,000 is on its way")).toBeInTheDocument());
  expect(getQuote).toHaveBeenCalledWith("USD/IDR");
  expect(signTransfer).toHaveBeenCalledWith(
    {},
    { from: MOM, to: TREASURY, value: 50_000_000n, validForSeconds: 3600 },
  );
  expect(startCashout).toHaveBeenCalledWith(session, {
    quoteId: "q-3",
    authorization: { from: MOM, to: TREASURY, value: "50000000" },
    bank: { channelCode: "ID_BCA", accountNumber: "1234567890", accountHolderName: "Ibu Sri" },
  });
});

test("more than the balance cannot be cashed out", async () => {
  render(<CashoutScreen />);
  await type("300");
  await fillBank();
  expect(screen.getByRole("button", { name: "Cash out" })).toBeDisabled();
});

test("an account number the bank would refuse keeps the button off", async () => {
  render(<CashoutScreen />);
  await type("50");
  await fillBank("123");
  expect(screen.getByRole("button", { name: "Cash out" })).toBeDisabled();
});

test("typed in rupiah, Rp 800,000 at 16,000 signs 50 USD", async () => {
  render(<CashoutScreen />);
  await userEvent.click(screen.getByRole("button", { name: "In rupiah" }));
  await type("800000");
  expect(screen.getByText("50.00 USD from your balance")).toBeInTheDocument();
  await fillBank();
  await userEvent.click(screen.getByRole("button", { name: "Cash out" }));
  await waitFor(() => expect(screen.getByText("Rp 800,000 is on its way")).toBeInTheDocument());
  expect(signTransfer).toHaveBeenCalledWith(
    {},
    { from: MOM, to: TREASURY, value: 50_000_000n, validForSeconds: 3600 },
  );
});

test("in rupiah, less than Rp 10,000 cannot be cashed out", async () => {
  render(<CashoutScreen />);
  await userEvent.click(screen.getByRole("button", { name: "In rupiah" }));
  await type("9000");
  await fillBank();
  expect(screen.getByText("The smallest cash out is Rp 10,000")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Cash out" })).toBeDisabled();
});
