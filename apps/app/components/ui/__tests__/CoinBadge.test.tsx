import { render, screen } from "@testing-library/react";
import { badgeForSymbol, CoinBadge } from "../CoinBadge";

test("Matocard's money has its own marks", () => {
  expect(badgeForSymbol("AUSD")).toBe("AUSD");
  expect(badgeForSymbol("MON")).toBe("MON");
  expect(badgeForSymbol("IDR")).toBe("IDR");
});

test("anything unknown falls back to AUSD rather than a broken image", () => {
  expect(badgeForSymbol("WOMBAT")).toBe("AUSD");
});

test("each mark is its own file", () => {
  render(
    <>
      <CoinBadge token="AUSD" />
      <CoinBadge token="MON" />
      <CoinBadge token="IDR" />
    </>,
  );
  expect(screen.getByAltText("AUSD")).toHaveAttribute("src", "/tokens/ausd.png");
  expect(screen.getByAltText("MON")).toHaveAttribute("src", "/tokens/mon.svg");
  expect(screen.getByAltText("IDR")).toHaveAttribute("src", "/tokens/idr.svg");
});
