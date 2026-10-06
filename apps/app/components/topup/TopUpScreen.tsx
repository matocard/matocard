"use client";
import { parseAmount, quoteToBase } from "@matocard/core";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useBackend } from "../../hooks/useBackend";
import { useCredit } from "../../hooks/useCredit";
import { useFx } from "../../hooks/useFx";
import { useMe } from "../../hooks/useMe";
import { useMyActivity } from "../../hooks/useMyActivity";
import { getQuote, startTopUp } from "../../lib/matocard/backend";
import { localFor } from "../../lib/matocard/local";
import { formatAusd, formatLocal } from "../../lib/matocard/money";
import { Button, Card, Keypad, Segmented, Spinner } from "../ui";
import { SubHeader } from "../ui/SubHeader";

type Method = "bank" | "qr" | "card";
const METHODS: readonly Method[] = ["bank", "qr", "card"];

/**
 * Top up (PLAN §3 step 3, §8): local money in, collateral out. It is paid at Xendit's checkout,
 * in ringgit for someone in Malaysia (FPX, DuitNow QR, Malaysian cards) or rupiah otherwise
 * (#79); the backend's relayer then credits the AUSD to the credit line, where it becomes
 * collateral that earns. Bank and QR count at once; a card waits out a hold first, which the
 * contract enforces so a chargeback cannot spend money that never arrived (D5).
 *
 * The quote is fresh at the moment of paying (60-second lock); the ≈ figure before that uses the
 * shared display rate and says so with "≈".
 */
export function TopUpScreen() {
  const router = useRouter();
  const credit = useCredit();
  const me = useMe();
  const local = localFor(me.country);
  const { rate } = useFx(local.pair);
  const activity = useMyActivity();
  const { run, busy, error } = useBackend();
  const [amount, setAmount] = useState("0");
  const [method, setMethod] = useState<Method>("bank");
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);

  // The amount in the currency's smallest unit (sen, rupiah); null when it has too many decimals.
  let fiat: bigint | null;
  try {
    fiat = parseAmount(amount === "" || amount === "." ? "0" : amount, local.currency);
  } catch {
    fiat = null;
  }
  const tooSmall = fiat !== null && fiat > 0n && fiat < local.minTopUp;
  const ausd =
    rate && fiat !== null && fiat > 0n
      ? quoteToBase(fiat, local.currency, "AUSD", rate, "down")
      : undefined;

  const pay = async () => {
    if (fiat === null) return;
    const checkout = await run(async (session) => {
      const quote = await getQuote(local.pair);
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
            {fiat !== null ? formatLocal(fiat, local.currency) : ""} by {local.methods[method]}. It
            shows here as soon as it is paid.
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
        // Rupiah has no decimals, so its keypad's "." does nothing.
        onChange={(next) => setAmount(local.decimals === 0 ? next.replace(".", "") : next)}
        symbol={local.symbol}
        invalid={tooSmall || fiat === null}
        hint={
          fiat === null
            ? `${local.symbol} takes at most ${local.decimals} decimals`
            : `The smallest top-up is ${formatLocal(local.minTopUp, local.currency)}`
        }
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
        renderLabel={(m) => local.methods[m]}
        className="mb-2"
      />
      <p className="mb-3 text-center text-[12px] text-muted">
        {method === "card"
          ? "A card top-up counts after a short hold, so a chargeback cannot spend it."
          : "Counts toward your limit as soon as it is paid."}
      </p>
      {error ? <p className="mb-2 text-center text-[13px] font-medium text-neg">{error}</p> : null}
      <div className="mt-auto">
        <Button onClick={pay} disabled={busy || fiat === null || fiat < local.minTopUp}>
          {busy ? (
            <Spinner />
          ) : (
            `Pay ${fiat !== null && fiat > 0n ? formatLocal(fiat, local.currency) : ""}`.trim()
          )}
        </Button>
      </div>
    </div>
  );
}
