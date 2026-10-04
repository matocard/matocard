import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { getAddress } from "viem";
import { SendScreen } from "../SendScreen";

const ME = "0x56A2950ddE6B1040d1DCC4b4C4Fc314Bd56eFB0E";
const MOM = "0xcc9c84af69ff5ad646a6fdcd02d092ee69c6106b"; // lowercase on purpose
const HASH = `0x${"cd".repeat(32)}`;

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), back: vi.fn() }) }));
vi.mock("wagmi", () => ({ useConfig: () => ({}) }));
vi.mock("../../../hooks/useWallet", () => ({ useWallet: () => ({ address: ME }) }));
vi.mock("../../../hooks/useFx", () => ({ useFx: () => ({ rate: "16000" }) }));
const session = { wallet: ME, until: 9_999_999_999, signature: "0x5" };
vi.mock("../../../hooks/useSession", () => ({
  useSession: () => ({ session, signIn: vi.fn(async () => session) }),
}));
const credit = vi.fn();
vi.mock("../../../hooks/useCredit", () => ({ useCredit: () => credit() }));
const signTransfer = vi.fn();
vi.mock("../../../lib/matocard/authorization", () => ({
  signTransfer: (...a: unknown[]) => signTransfer(...a),
}));
const sendSigned = vi.fn();
vi.mock("../../../lib/matocard/backend", () => ({
  sendSigned: (...a: unknown[]) => sendSigned(...a),
}));

const draw = vi.fn();
const type = async (digits: string) => {
  for (const d of digits) await userEvent.click(screen.getByRole("button", { name: d }));
};

beforeEach(() => {
  vi.clearAllMocks();
  draw.mockResolvedValue(HASH);
  credit.mockReturnValue({ available: 100_000_000n, ausdBalance: 0n, draw });
  signTransfer.mockResolvedValue({ from: ME, to: getAddress(MOM), value: "50000000" });
  sendSigned.mockResolvedValue({ hash: HASH });
});

test("Rp 800,000 from the card draws 50 USD straight to Mom", async () => {
  render(<SendScreen />);
  await userEvent.type(screen.getByPlaceholderText("0x…"), MOM);
  await type("800000");
  expect(
    screen.getByText("They get 50.00 USD · AUSD, Rp 800,000 at today's rate"),
  ).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Send" }));
  await waitFor(() => expect(screen.getByText(/Sent 50.00 USD/)).toBeInTheDocument());
  expect(draw).toHaveBeenCalledWith(50_000_000n, getAddress(MOM));
});

test("not an account, or your own, cannot be sent to", async () => {
  render(<SendScreen />);
  await type("100000");
  await userEvent.type(screen.getByPlaceholderText("0x…"), "0x1234");
  expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  await userEvent.clear(screen.getByPlaceholderText("0x…"));
  await userEvent.type(screen.getByPlaceholderText("0x…"), ME.toLowerCase());
  expect(screen.getByText("That is your own account.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
});

test("more than the card has available is refused", async () => {
  render(<SendScreen />);
  await userEvent.type(screen.getByPlaceholderText("0x…"), MOM);
  await type("2000000"); // 125 USD against 100 available
  expect(screen.getByText("Your card has 100.00 USD available")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
});

test("from the balance it is a signed transfer the backend sends, no MON needed", async () => {
  credit.mockReturnValue({ available: 100_000_000n, ausdBalance: 60_000_000n, draw });
  render(<SendScreen />);
  await userEvent.click(screen.getByRole("button", { name: "From my balance" }));
  await userEvent.type(screen.getByPlaceholderText("0x…"), MOM);
  await type("800000");
  await userEvent.click(screen.getByRole("button", { name: "Send" }));
  await waitFor(() => expect(screen.getByText(/Sent 50.00 USD/)).toBeInTheDocument());
  expect(signTransfer).toHaveBeenCalledWith(
    {},
    { from: ME, to: getAddress(MOM), value: 50_000_000n },
  );
  expect(sendSigned).toHaveBeenCalledWith(session, expect.objectContaining({ value: "50000000" }));
  expect(draw).not.toHaveBeenCalled();
});

test("with nothing in the balance, only the card is offered", () => {
  render(<SendScreen />);
  expect(screen.queryByRole("button", { name: "From my balance" })).not.toBeInTheDocument();
});
