"use client";
import { baseToQuote, parseAmount, quoteToBase } from "@matocard/core";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { getAddress } from "viem";
import { useConfig } from "wagmi";
import { useBackend } from "../../hooks/useBackend";
import { useCredit } from "../../hooks/useCredit";
import { useFx } from "../../hooks/useFx";
import { useWallet } from "../../hooks/useWallet";
import { quickAmount } from "../../lib/matocard/amount";
import { signTransfer } from "../../lib/matocard/authorization";
import { getQuote, startCashout, TREASURY } from "../../lib/matocard/backend";
import { formatAusd, formatIdr } from "../../lib/matocard/money";
import { Button, Card, Keypad, Segmented, Spinner } from "../ui";
import { SubHeader } from "../ui/SubHeader";

/** Banks Xendit pays out to in Indonesia, as its channel codes (#71: `ID_BCA` checked live). */
const BANKS = ["ID_BCA", "ID_BRI", "ID_BNI", "ID_MANDIRI"] as const;
type Bank = (typeof BANKS)[number];
const BANK_NAME: Record<Bank, string> = {
  ID_BCA: "BCA",
  ID_BRI: "BRI",
  ID_BNI: "BNI",
  ID_MANDIRI: "Mandiri",
};

/** What the keypad types in: dollars from the balance, or the rupiah the bank should receive. */
const UNITS = ["USD", "IDR"] as const;
type Unit = (typeof UNITS)[number];
const UNIT_LABEL: Record<Unit, string> = { USD: "In USD", IDR: "In rupiah" };

/** The backend's floor for a payout. */
const MIN_CASHOUT = 10_000n;

const ausdOf = (text: string): bigint | null => {
  try {
    return parseAmount(text === "" || text === "." ? "0" : text, "AUSD");
  } catch {
    return null;
  }
};

/**
 * Receive and cash out (PLAN §3 step 5, §8): money sent to this account sits as a balance, and
 * cashing out pays it to an Indonesian bank in rupiah. The user signs the AUSD over to the
 * treasury (ERC-3009, so no MON is needed); the backend then pays the rupiah through Xendit at a
 * fresh `USD/IDR` quote, rounded down. Always rupiah: the family's bank is Indonesian.
 *
 * The amount is typed in USD or in rupiah (docs/guides/cash-out.mdx). Typed in rupiah, the AUSD
 * signed is that figure at the display rate, rounded down, so the bank gets about what was typed.
 */
export function CashoutScreen() {
  const router = useRouter();
  const config = useConfig();
  const { address } = useWallet();
  const credit = useCredit();
  const { rate } = useFx("USD/IDR");
  const backend = useBackend();
  const [unit, setUnit] = useState<Unit>("USD");
  const [amount, setAmount] = useState("0");
  const [bank, setBank] = useState<Bank>("ID_BCA");
  const [account, setAccount] = useState("");
  const [holder, setHolder] = useState("");
  const [sent, setSent] = useState<bigint | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [signing, setSigning] = useState(false);

  const balance = credit.ausdBalance ?? 0n;
  const typedRupiah = BigInt(amount.split(".")[0] || "0");
  const ausd =
    unit === "USD"
      ? ausdOf(amount)
      : rate && typedRupiah > 0n
        ? quoteToBase(typedRupiah, "IDR", "AUSD", rate, "down")
        : 0n;
  const rupiah =
    unit === "IDR"
      ? typedRupiah
      : ausd && rate
        ? baseToQuote(ausd, "AUSD", "IDR", rate, "down")
        : 0n;
  const tooSmallTyped = unit === "IDR" && typedRupiah > 0n && typedRupiah < MIN_CASHOUT;
  const tooMuch = ausd !== null && ausd > balance;
  const tooSmall = tooSmallTyped || (ausd !== null && ausd > 0n && rupiah < MIN_CASHOUT);
  const accountValid = /^\d{6,20}$/.test(account);
  const ready =
    ausd !== null && ausd > 0n && !tooMuch && !tooSmall && accountValid && holder.trim() !== "";

  const cashOut = async () => {
    if (!ready || !address || ausd === null) return;
    setSigning(true);
    setFailed(null);
    try {
      const quote = await getQuote("USD/IDR");
      // The backend wants at least five minutes left on it; an hour leaves room to sign.
      const authorization = await signTransfer(config, {
        from: getAddress(address),
        to: TREASURY,
        value: ausd,
        validForSeconds: 3600,
      });
      const payout = await backend.run((session) =>
        startCashout(session, {
          quoteId: quote.id,
          authorization,
          bank: { channelCode: bank, accountNumber: account, accountHolderName: holder.trim() },
        }),
      );
      if (payout) setSent(BigInt(payout.fiat));
    } catch (e) {
      setFailed(e instanceof Error ? (e.message.split("\n")[0] ?? null) : "Could not cash out.");
    } finally {
      setSigning(false);
    }
  };

  if (sent !== null) {
    return (
      <div className="flex flex-1 flex-col">
        <SubHeader title="Cash out" />
        <Card className="px-5 py-4">
          <h2 className="text-[16px] font-semibold">{formatIdr(sent)} is on its way</h2>
          <p className="mt-1 text-[13.5px] text-muted">
            To {BANK_NAME[bank]} {account}. It shows in your activity until the bank receives it.
          </p>
        </Card>
        <div className="mt-auto">
          <Button onClick={() => router.push("/home")}>Done</Button>
        </div>
      </div>
    );
  }

  const error = failed ?? backend.error;
  return (
    <div className="flex flex-1 flex-col">
      <SubHeader title="Cash out" />
      <p className="mb-1 text-center text-[13px] text-muted">
        {formatAusd(balance)} USD in your balance
      </p>
      <Segmented
        options={UNITS}
        value={unit}
        onChange={(next) => {
          setUnit(next);
          setAmount("0");
        }}
        label="Amount in"
        variant="period"
        renderLabel={(u) => UNIT_LABEL[u]}
        className="mb-1"
      />
      <Keypad
        value={amount}
        onChange={(next) => setAmount(unit === "IDR" ? next.replace(".", "") : next)}
        symbol={unit === "IDR" ? "Rp" : "$"}
        onQuick={unit === "USD" ? (pct) => setAmount(quickAmount(balance, pct, 6)) : undefined}
        invalid={tooMuch || tooSmall || ausd === null}
        hint={
          tooSmall ? `The smallest cash out is ${formatIdr(MIN_CASHOUT)}` : "More than your balance"
        }
      />
      <p className="mb-3 text-center text-[13px] text-muted">
        {unit === "IDR"
          ? ausd && ausd > 0n
            ? `${formatAusd(ausd)} USD from your balance`
            : "Paid to your bank in rupiah"
          : rupiah > 0n
            ? `${formatIdr(rupiah)} to your bank`
            : "Paid to your bank in rupiah"}
      </p>

      <Segmented
        options={BANKS}
        value={bank}
        onChange={setBank}
        label="Bank"
        variant="period"
        renderLabel={(b) => BANK_NAME[b]}
        className="mb-2"
      />
      <div className="mb-2 grid gap-2">
        <input
          value={account}
          onChange={(e) => setAccount(e.target.value.replace(/\D/g, ""))}
          inputMode="numeric"
          placeholder="Account number"
          aria-label="Account number"
          className="rounded-[14px] border border-line bg-white px-4 py-3 text-[14px] outline-none"
        />
        <input
          value={holder}
          onChange={(e) => setHolder(e.target.value)}
          placeholder="Name on the account"
          aria-label="Name on the account"
          className="rounded-[14px] border border-line bg-white px-4 py-3 text-[14px] outline-none"
        />
      </div>

      {error ? <p className="mb-2 text-center text-[13px] font-medium text-neg">{error}</p> : null}
      <div className="mt-auto">
        <Button onClick={cashOut} disabled={!ready || signing || backend.busy}>
          {signing || backend.busy ? <Spinner /> : "Cash out"}
        </Button>
      </div>
    </div>
  );
}
