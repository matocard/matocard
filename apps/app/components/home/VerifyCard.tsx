"use client";
import type { KycStatus } from "../../lib/matocard/backend";
import { COUNTRIES } from "../../lib/matocard/local";
import { CardArtwork } from "../card/CardArtwork";
import { Button, Spinner } from "../ui";

/**
 * The card before it is issued: the real card face, blurred and dimmed, with the one step that
 * activates it on top (PLAN §3 steps 1 and 2, §8 Onboarding). Sign in to the backend once, say
 * where you live (it picks the currency you pay in), then verify identity with Didit. One identity,
 * one account (D4), so a document already used elsewhere ends here as `duplicate`.
 *
 * It sits where the card will be, so the step reads as unlocking the card rather than as a form
 * above it. Wording is Axel's call.
 */
export function VerifyCard({
  signedIn,
  country,
  kyc,
  busy,
  onSignIn,
  onCountry,
  onVerify,
  className = "",
}: {
  signedIn: boolean;
  /** Null when read and not chosen yet. */
  country: string | null | undefined;
  kyc: KycStatus | undefined;
  busy: boolean;
  onSignIn: () => void;
  onCountry: (code: string) => void;
  onVerify: () => void;
  className?: string;
}) {
  const choosing = signedIn && country === null;
  const [title, body, action] = !signedIn
    ? ["Activate your card", "", "Continue"]
    : choosing
      ? ["Where do you live?", "You top up and settle in its money.", null]
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
                "Activate your card",
                "An ID photo and a selfie. It takes about a minute.",
                "Verify identity",
              ];

  return (
    <section
      aria-label="Your card, not issued yet"
      className={`relative mx-auto aspect-[1.586] w-full max-w-[340px] overflow-hidden rounded-[22px] ${className}`}
    >
      {/* The card it will become, out of focus: decoration, so screen readers skip it. */}
      <div aria-hidden="true" className="absolute inset-0 scale-110 blur-[7px]">
        <CardArtwork holder="" expiry="••/••" detailsVisible={false} />
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/45 px-6 text-center text-white">
        <h2 className="text-[18px] font-semibold tracking-[-0.01em]">{title}</h2>
        {body ? <p className="mt-1 text-[13px] text-white/75">{body}</p> : null}
        {choosing ? (
          <div className="mt-3 flex w-full gap-2">
            {COUNTRIES.map((c) => (
              <Button
                key={c.code}
                variant="glass"
                size="md"
                disabled={busy}
                onClick={() => onCountry(c.code)}
              >
                {c.name}
              </Button>
            ))}
          </div>
        ) : action ? (
          <Button
            variant="glass"
            size="md"
            className="mt-3 !w-auto px-7"
            disabled={busy}
            onClick={signedIn ? onVerify : onSignIn}
          >
            {busy ? <Spinner /> : action}
          </Button>
        ) : kyc === "pending" ? (
          <div className="mt-3 flex items-center gap-2 text-[13px] text-white/80">
            <Spinner /> Waiting for the result
          </div>
        ) : null}
      </div>
    </section>
  );
}
