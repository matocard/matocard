import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { KycStatus } from "../../../lib/matocard/backend";
import { VerifyCard } from "../VerifyCard";

/** The states `GET /me` reports for `user.kyc` (#89), each its own screen. */
const renderCard = (kyc: KycStatus, onVerify = vi.fn()) => {
  render(
    <VerifyCard
      signedIn
      country="MY"
      kyc={kyc}
      busy={false}
      onSignIn={vi.fn()}
      onCountry={vi.fn()}
      onVerify={onVerify}
    />,
  );
  return onVerify;
};

test("pending reads as in review, with no spinner and nothing started on its own", () => {
  const onVerify = renderCard("pending");
  expect(screen.getByText("Verification in review")).toBeInTheDocument();
  expect(screen.getByText(/This can take a few hours/)).toBeInTheDocument();
  // The spinner is aria-hidden, so look for its class.
  expect(document.querySelector(".motion-safe\\:animate-spin")).toBeNull();
  expect(onVerify).not.toHaveBeenCalled();
});

test("pending offers to start again for someone who closed Didit before submitting", async () => {
  const onVerify = renderCard("pending");
  await userEvent.click(screen.getByRole("button", { name: "Didn't finish? Start again" }));
  expect(onVerify).toHaveBeenCalledOnce();
});

test("rejected is an end state with a retry", async () => {
  const onVerify = renderCard("rejected");
  expect(screen.getByText("We could not verify you")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(onVerify).toHaveBeenCalledOnce();
});

test("duplicate is an end state with no way to start again", () => {
  renderCard("duplicate");
  expect(screen.getByText("This identity already has a card")).toBeInTheDocument();
  expect(screen.queryByRole("button")).toBeNull();
});

test("none asks to verify", () => {
  renderCard("none");
  expect(screen.getByRole("button", { name: "Verify identity" })).toBeInTheDocument();
});
