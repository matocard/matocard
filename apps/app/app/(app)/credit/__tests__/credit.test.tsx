import { render, screen } from "@testing-library/react";
import CreditPage from "../page";

const ME = "0xc6E0De07b60a412c1bb990B77612754B9254DBDa";
vi.mock("../../../../hooks/useWallet", () => ({ useWallet: () => ({ address: ME }) }));
const verify = vi.fn();
vi.mock("../../../../hooks/useVerifyRecord", () => ({ useVerifyRecord: (w: string) => verify(w) }));

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
