"use client";
import { quoteToBase } from "@matocard/core";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useBackend } from "../../hooks/useBackend";
import { useCredit } from "../../hooks/useCredit";
import { useFx } from "../../hooks/useFx";
import { useMyActivity } from "../../hooks/useMyActivity";
import { getQuote, startTopUp } from "../../lib/matocard/backend";
import { formatAusd, formatIdr } from "../../lib/matocard/money";
import { Button, Card, Keypad, Segmented, Spinner } from "../ui";
import { SubHeader } from "../ui/SubHeader";

type Method = "bank" | "qr" | "card";
const METHODS: readonly Method[] = ["bank", "qr", "card"];
const LABEL: Record<Method, string> = { bank: "Bank transfer", qr: "QRIS", card: "Card" };

/** The backend's floor (#69). */
export const MIN_TOP_UP = 10_000n;

/** Whole rupiah from the keypad's text; the keypad's "." has no meaning for rupiah. */
const rupiah = (text: string) => BigInt(text.split(".")[0] || "0");

/**
 * Top up (PLAN §3 step 3, §8): rupiah in, collateral out. The rupiah is paid at Xendit's checkout;
 * the backend's relayer then credits the AUSD to the credit line, where it becomes collateral that
 * earns. A bank transfer or QRIS counts at once; a card waits out a hold first, which the contract
 * enforces so a chargeback cannot spend money that never arrived (D5).
 *
 * The quote is fresh at the moment of paying (60-second lock); the ≈ figure before that uses the
 * shared display rate and says so with "≈".
 */
export function TopUpScreen() {
  const router = useRouter();
  const credit = useCredit();
  const { rate } = useFx();
  const activity = useMyActivity();
  const { run, busy, error } = useBackend();
  const [amount, setAmount] = useState("0");
  const [method, setMethod] = useState<Method>("bank");
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);

  const fiat = rupiah(amount);
  const tooSmall = fiat > 0n && fiat < MIN_TOP_UP;
  const ausd = rate && fiat > 0n ? quoteToBase(fiat, "IDR", "AUSD", rate, "down") : undefined;

  const pay = async () => {
    const checkout = await run(async (session) => {
      const quote = await getQuote("USD/IDR");
      return startTopUp(session, { amount: fiat.toString(), method, quoteId: quote.id });
    });
    if (!checkout) return;
    setCheckoutUrl(checkout.checkoutUrl);
    window.open(checkout.checkoutUrl, "_blank", "noopener");
  };

  if (credit.verified === false) {
    return (
      <div className="flex flex-1 flex-col">
        <SubHeader title="Top up" />
        <Card className="px-5 py-4">
          <h2 className="text-[16px] font-semibold">Verify your identity first</h2>
          <p className="mt-1 text-[13.5px] text-muted">
            A top-up needs a card, and a card needs you verified.
          </p>
          <Button className="mt-3" onClick={() => router.push("/home")}>
            Go to Home
          </Button>
        </Card>
      </div>
    );
  }

  if (checkoutUrl) {
    const inFlight = activity.items.filter((i) => i.flag);
    return (
      <div className="flex flex-1 flex-col">
        <SubHeader title="Top up" />
        <Card className="px-5 py-4">
          <h2 className="text-[16px] font-semibold">Finish paying in the new tab</h2>
          <p className="mt-1 text-[13.5px] text-muted">
            {formatIdr(fiat)} by {LABEL[method].toLowerCase()}. It shows here as soon as it is paid.
          </p>
          <ul className="mt-3 space-y-1.5 text-[13.5px]">
            {inFlight.length === 0 ? (
              <li className="flex items-center gap-2 text-muted">
                <Spinner /> Waiting for the payment
              </li>
            ) : (
              inFlight.map((i) => (
                <li key={i.id} className="flex items-center gap-2">
                  <Spinner /> {i.kind}: {i.detail}
                </li>
              ))
            )}
          </ul>
          <a
            className="mt-3 block text-[13.5px] font-medium underline"
            href={checkoutUrl}
            target="_blank"
            rel="noopener"
          >
            Open the payment page again
          </a>
        </Card>
        <div className="mt-auto">
          <Button onClick={() => router.push("/home")}>Back to Home</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <SubHeader title="Top up" />
      <Keypad
        value={amount}
        onChange={(next) => setAmount(next.replace(".", ""))}
        symbol="Rp"
        invalid={tooSmall}
        hint={`The smallest top-up is ${formatIdr(MIN_TOP_UP)}`}
      />
      <p className="mb-3 text-center text-[13px] text-muted">
        {ausd === undefined
          ? "Becomes collateral for your card"
          : `≈ ${formatAusd(ausd)} USD of collateral, held as AUSD`}
      </p>
      <Segmented
        options={METHODS}
        value={method}
        onChange={setMethod}
        label="Pay with"
        variant="period"
        renderLabel={(m) => LABEL[m]}
        className="mb-2"
      />
      <p className="mb-3 text-center text-[12px] text-muted">
        {method === "card"
          ? "A card top-up counts after a short hold, so a chargeback cannot spend it."
          : "Counts toward your limit as soon as it is paid."}
      </p>
      {error ? <p className="mb-2 text-center text-[13px] font-medium text-neg">{error}</p> : null}
      <div className="mt-auto">
        <Button onClick={pay} disabled={busy || fiat < MIN_TOP_UP}>
          {busy ? <Spinner /> : `Pay ${fiat > 0n ? formatIdr(fiat) : ""}`.trim()}
        </Button>
      </div>
    </div>
  );
}
