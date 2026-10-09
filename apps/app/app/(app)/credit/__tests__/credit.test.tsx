import { render, screen, within } from "@testing-library/react";
import CreditPage from "../page";

const ME = "0xc6E0De07b60a412c1bb990B77612754B9254DBDa";
vi.mock("../../../../hooks/useWallet", () => ({ useWallet: () => ({ address: ME }) }));
const verify = vi.fn();
vi.mock("../../../../hooks/useVerifyRecord", () => ({ useVerifyRecord: (w: string) => verify(w) }));
const credit = vi.fn();
vi.mock("../../../../hooks/useCredit", () => ({ useCredit: () => credit() }));
vi.mock("../../../../hooks/useMe", () => ({ useMe: () => ({ country: "ID", collateral: {} }) }));
vi.mock("../../../../hooks/useFx", () => ({ useFx: () => ({ rate: "16000" }) }));

beforeEach(() => {
  // The demo account at score 0: 150 AUSD of deposit, limit 100.
  credit.mockReturnValue({
    verified: true,
    score: 0n,
    ratioBps: 15_000n,
    limit: 100_000_000n,
    collateral: { value: 150_000_000n, shares: 0n, pendingShares: 0n, pendingUntil: 0n },
  });
});

test("your own record, read the way anyone else reads it, and the link to share it", () => {
  verify.mockReturnValue({
    loading: false,
    error: undefined,
    record: {
      account: ME,
      verified: true,
      score: "55",
      ratioBps: "11150",
      cycles: { counted: "3", repaid: "3" },
      defaulted: false,
      history: null,
    },
  });
  render(<CreditPage />);
  expect(verify).toHaveBeenCalledWith(ME);
  expect(screen.getByText("Your credit record")).toBeInTheDocument();
  expect(screen.getByText("55")).toBeInTheDocument();
  expect(screen.getByText(`http://localhost:3000/verify/${ME}`)).toBeInTheDocument();
});

test("how the limit is worked out: deposit, score, deposit needed, limit", () => {
  verify.mockReturnValue({ loading: false, error: undefined, record: undefined });
  render(<CreditPage />);
  const card = screen.getByText("How your limit is worked out").closest("div") as HTMLElement;
  expect(within(card).getByText("150.00 USD")).toBeInTheDocument();
  expect(within(card).getByText("Rp 2,400,000")).toBeInTheDocument();
  expect(within(card).getByText("0 of 100")).toBeInTheDocument();
  expect(within(card).getByText("100.00 USD")).toBeInTheDocument();
});

test("no breakdown before the card is issued", () => {
  credit.mockReturnValue({ verified: false });
  verify.mockReturnValue({ loading: false, error: undefined, record: undefined });
  render(<CreditPage />);
  expect(screen.queryByText("How your limit is worked out")).toBeNull();
});
