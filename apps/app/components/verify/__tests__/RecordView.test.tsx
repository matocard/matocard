import { render, screen } from "@testing-library/react";
import type { VerifyRecord } from "../../../lib/matocard/backend";
import { RecordView } from "../RecordView";

/** Siti's live record (`GET /verify/0xc6E0…DBDa`, 4 Oct 2026), trimmed to two cycles. */
const SITI: VerifyRecord = {
  account: "0xc6E0De07b60a412c1bb990B77612754B9254DBDa",
  verified: true,
  score: "55",
  ratioBps: "11150",
  cycles: { counted: "3", repaid: "3" },
  defaulted: false,
  history: {
    score: "55",
    cycleCount: 3,
    repayCount: 3,
    cyclesOpened: 3,
    defaulted: false,
    verifiedAt: "1790756725",
    firstSeenAt: "1790756725",
    cycles: [
      {
        number: 1,
        outcome: "Qualified",
        openedAt: "1790756737",
        closedAt: "1790756804",
        peakDrawn: "80000000",
        totalRepaid: "80000000",
        scoreAfter: "18",
        openTxHash: "0x864a",
        closeTxHash: "0x503c",
      },
      {
        number: 2,
        outcome: "Qualified",
        openedAt: "1790756808",
        closedAt: "1790756876",
        peakDrawn: "87336244",
        totalRepaid: "87336244",
        scoreAfter: "36",
        openTxHash: "0x64f8",
        closeTxHash: "0x8595",
      },
    ],
  },
};

test("the record shows score, ratio and cycles, each with its proof", () => {
  render(<RecordView record={SITI} loading={false} error={undefined} />);
  expect(screen.getByText("55")).toBeInTheDocument();
  expect(screen.getByText("111.5%")).toBeInTheDocument();
  expect(screen.getByText("Verified person")).toBeInTheDocument();
  expect(screen.getByText("Cycle 1: Repaid on time")).toBeInTheDocument();
  expect(screen.getByText("Score 36")).toBeInTheDocument();
  const proofs = screen.getAllByRole("link", { name: "Proof" });
  expect(proofs[0]).toHaveAttribute("href", "https://testnet.monadvision.com/tx/0x503c");
});

test("nothing personal: no name or document, only the account", () => {
  const { container } = render(<RecordView record={SITI} loading={false} error={undefined} />);
  expect(container.textContent).not.toMatch(/passport|document|name/i);
});

test("a down indexer still shows the score, and says the history is catching up", () => {
  render(
    <RecordView
      record={{ ...SITI, history: null, indexer: "unavailable" }}
      loading={false}
      error={undefined}
    />,
  );
  expect(screen.getByText("55")).toBeInTheDocument();
  expect(screen.getByText(/history is catching up/)).toBeInTheDocument();
});

test("a default is said plainly", () => {
  render(<RecordView record={{ ...SITI, defaulted: true }} loading={false} error={undefined} />);
  expect(screen.getByText("Has a default")).toBeInTheDocument();
});
