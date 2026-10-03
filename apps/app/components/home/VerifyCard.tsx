"use client";
import type { KycStatus } from "../../lib/matocard/backend";
import { Button, Card, Spinner } from "../ui";

/**
 * The step between connecting and having a card (PLAN §3 steps 1 and 2): sign in to the backend
 * once, then verify identity with Didit. One identity, one account (D4), so a document already
 * used elsewhere ends here as `duplicate`.
 */
export function VerifyCard({
  signedIn,
  kyc,
  busy,
  onSignIn,
  onVerify,
}: {
  signedIn: boolean;
  kyc: KycStatus | undefined;
  busy: boolean;
  onSignIn: () => void;
  onVerify: () => void;
}) {
  const [title, body, action] = !signedIn
    ? ["Open your card", "Confirm it is you once. Nothing is charged.", "Continue"]
    : kyc === "pending"
      ? ["Checking your identity", "This usually takes a few seconds after you finish.", null]
      : kyc === "duplicate"
        ? [
            "This identity already has a card",
            "One person, one card. Sign in with the account you opened first.",
            null,
          ]
        : kyc === "rejected"
          ? ["We could not verify you", "Try again with a clear photo of your ID.", "Try again"]
          : [
              "Verify your identity",
              "An ID photo and a selfie. It takes about a minute.",
              "Verify identity",
            ];
  return (
    <Card className="mb-[22px] px-5 py-4">
      <h2 className="text-[16px] font-semibold">{title}</h2>
      <p className="mt-1 text-[13.5px] text-muted">{body}</p>
      {action ? (
        <Button className="mt-3" disabled={busy} onClick={signedIn ? onVerify : onSignIn}>
          {busy ? <Spinner /> : action}
        </Button>
      ) : kyc === "pending" ? (
        <div className="mt-3 flex items-center gap-2 text-[13px] text-muted">
          <Spinner /> Waiting for the result
        </div>
      ) : null}
    </Card>
  );
}
