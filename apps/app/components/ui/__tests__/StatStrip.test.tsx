import { render, screen } from "@testing-library/react";
import { StatStrip } from "../StatStrip";

/**
 * The summary band. Its whole job is to state the account in four readings, so the thing worth
 * pinning is what it does when a reading is missing: a dash, never a zero. "0 USD" in the Balance
 * tile is a claim that nothing is owed, and an unread contract has not established that.
 */

test("a null value prints a dash rather than a zero", () => {
  render(
    <StatStrip
      stats={[
        { label: "Credit limit", value: null },
        { label: "Balance", value: "0 USD" },
      ]}
    />,
  );

  expect(screen.getByText("—")).toBeInTheDocument();
  // The zero beside it is a real reading and stays one.
  expect(screen.getByText("0 USD")).toBeInTheDocument();
});

test("withholds every figure while the first read is outstanding", () => {
  render(<StatStrip loading stats={[{ label: "Credit limit", value: "33 USD" }]} />);

  expect(screen.getByText("Credit limit")).toBeInTheDocument();
  expect(screen.queryByText("33 USD")).toBeNull();
});

test("carries the hint and the negative tone an owed balance needs", () => {
  render(
    <StatStrip
      stats={[
        {
          label: "Balance",
          value: "1 USD",
          tone: "neg",
          hint: "Repay in full to close the cycle",
        },
      ]}
    />,
  );

  expect(screen.getByText("1 USD")).toHaveClass("text-neg");
  expect(screen.getByText("Repay in full to close the cycle")).toBeInTheDocument();
});
