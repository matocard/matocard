"use client";
import type { KycStatus } from "../../lib/matocard/backend";
import { COUNTRIES } from "../../lib/matocard/local";
import { Button, Card, Spinner } from "../ui";

/**
 * The step between connecting and having a card (PLAN §3 steps 1 and 2, §8 Onboarding): sign in
 * to the backend once, say where you live (it picks the currency you pay in), then verify identity
 * with Didit. One identity, one account (D4), so a document already
 * used elsewhere ends here as `duplicate`.
 */
export function VerifyCard({
  signedIn,
  country,
  kyc,
  busy,
  onSignIn,
  onCountry,
  onVerify,
}: {
  signedIn: boolean;
  /** Null when read and not chosen yet. */
  country: string | null | undefined;
  kyc: KycStatus | undefined;
  busy: boolean;
  onSignIn: () => void;
  onCountry: (code: string) => void;
  onVerify: () => void;
}) {
  if (signedIn && country === null) {
    return (
      <Card className="mb-[22px] px-5 py-4">
        <h2 className="text-[16px] font-semibold">Where do you live?</h2>
        <p className="mt-1 text-[13.5px] text-muted">You top up and settle in its money.</p>
        <div className="mt-3 flex gap-2.5">
          {COUNTRIES.map((c) => (
            <Button key={c.code} variant="glass" disabled={busy} onClick={() => onCountry(c.code)}>
              {c.name}
            </Button>
          ))}
        </div>
      </Card>
    );
  }
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
