import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InfoTip } from "../InfoTip";

test("tap opens the explanation, a tap outside and Escape close it", async () => {
  render(
    <div>
      <InfoTip label="Balance">Money sent to you.</InfoTip>
      <button type="button">elsewhere</button>
    </div>,
  );
  const tip = screen.getByRole("button", { name: "About Balance" });
  expect(tip).toHaveAttribute("aria-expanded", "false");
  await userEvent.click(tip);
  expect(tip).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByRole("tooltip")).toHaveTextContent("Money sent to you.");
  await userEvent.click(screen.getByRole("button", { name: "elsewhere" }));
  expect(tip).toHaveAttribute("aria-expanded", "false");
  await userEvent.click(tip);
  await userEvent.keyboard("{Escape}");
  expect(tip).toHaveAttribute("aria-expanded", "false");
});
