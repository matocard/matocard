import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AccountPage from "../page";

const ME = "0x56A2950ddE6B1040d1DCC4b4C4Fc314Bd56eFB0E";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/account",
  useSearchParams: () => new URLSearchParams(""),
}));
vi.mock("../../../../hooks/useRedirectDesktopToHome", () => ({
  useRedirectDesktopToHome: () => false,
}));
vi.mock("../../../../hooks/useWallet", () => ({
  useWallet: () => ({ address: ME, disconnect: vi.fn() }),
}));
const credit = vi.fn();
vi.mock("../../../../hooks/useCredit", () => ({ useCredit: () => credit() }));
const me = vi.fn();
vi.mock("../../../../hooks/useMe", () => ({ useMe: () => me() }));

beforeEach(() => {
  credit.mockReturnValue({ verified: true });
  me.mockReturnValue({ cardHolder: "Emak Emak", country: "ID" });
});

test("the name and a verified badge, and no 0x on the page", () => {
  render(<AccountPage />);
  expect(screen.getByText("EE")).toBeInTheDocument();
  expect(screen.getByText("Emak Emak")).toBeInTheDocument();
  expect(screen.getByText("ID verified")).toBeInTheDocument();
  // The address waits in the Receive sheet; the header no longer shows it.
  expect(screen.queryByText("0x56...FB0E")).toBeNull();
});

test("where you live and the money you pay in", () => {
  render(<AccountPage />);
  const details = screen.getByText("Details").closest("section") as HTMLElement;
  expect(within(details).getByText("Indonesia")).toBeInTheDocument();
  expect(within(details).getByText("Rupiah")).toBeInTheDocument();
});

test("Receive money shows the account as a QR and to copy", async () => {
  render(<AccountPage />);
  await userEvent.click(screen.getByRole("button", { name: /Receive money/ }));
  expect(await screen.findByText(ME)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Copy your account" })).toBeInTheDocument();
});

test("History opens the full list", () => {
  render(<AccountPage />);
  expect(screen.getByRole("button", { name: /History/ })).toBeInTheDocument();
  expect(screen.queryByText("Activity")).toBeNull();
});

test("before verification: no name, no badge, the generated avatar", () => {
  credit.mockReturnValue({ verified: false });
  me.mockReturnValue({ cardHolder: null, country: null });
  render(<AccountPage />);
  expect(screen.queryByText("ID verified")).toBeNull();
  expect(screen.queryByText("Details")).toBeNull();
});
