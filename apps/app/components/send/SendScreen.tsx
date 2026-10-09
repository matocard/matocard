"use client";
import { quoteToBase } from "@matocard/core";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { type Address, getAddress, isAddress } from "viem";
import { useConfig } from "wagmi";
import { useBackend } from "../../hooks/useBackend";
import { useCredit } from "../../hooks/useCredit";
import { useFx } from "../../hooks/useFx";
import { useWallet } from "../../hooks/useWallet";
import { signTransfer } from "../../lib/matocard/authorization";
import { sendSigned } from "../../lib/matocard/backend";
import { explorerTx } from "../../lib/matocard/monad";
import { formatAusd, formatIdr } from "../../lib/matocard/money";
import { Button, Keypad, PendingLabel, Segmented, TransactionStatus } from "../ui";
import { SubHeader } from "../ui/SubHeader";
import { QrScanButton } from "./QrScanButton";

type Source = "card" | "balance";
const SOURCES: readonly Source[] = ["card", "balance"];
const SOURCE_LABEL: Record<Source, string> = { card: "From my card", balance: "From my balance" };

/**
 * Send to family (PLAN §3 step 5, §8): typed in rupiah, the money Mom spends, and paid as AUSD
 * straight to her Matocard account, settled in under a second.
 *
 * Two sources (#71). **From my card** draws against the limit and pays her directly
 * (`draw(amount, to)`, the user's own transaction, interest-free, repaid at settle). **From my
 * balance** sends AUSD already in the account with a signed ERC-3009 transfer that the backend's
 * relayer submits, so it needs no MON (D11).
 *
 * The rupiah converts at the shared display rate: the AUSD figure is what leaves.
 */
export function SendScreen() {
  const router = useRouter();
  const config = useConfig();
  const { address } = useWallet();
  const credit = useCredit();
  const { rate } = useFx("USD/IDR");
  const backend = useBackend();
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("0");
  const [source, setSource] = useState<Source>("card");
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const recipient = to.trim();
  const valid = isAddress(recipient);
  const self = valid && !!address && getAddress(recipient) === getAddress(address);
  const rupiah = BigInt(amount.split(".")[0] || "0");
  const ausd = rate && rupiah > 0n ? quoteToBase(rupiah, "IDR", "AUSD", rate, "down") : 0n;
  const ceiling = source === "card" ? credit.available : credit.ausdBalance;
  const tooMuch = ceiling !== undefined && ausd > ceiling;
  const hasBalance = (credit.ausdBalance ?? 0n) > 0n;

  const send = async () => {
    if (!valid || self || ausd === 0n || tooMuch || !address) return;
    setSending(true);
    setFailed(null);
    try {
      const target = getAddress(recipient) as Address;
      if (source === "card") {
        setDone(await credit.draw(ausd, target));
      } else {
        const authorization = await signTransfer(config, {
          from: getAddress(address),
          to: target,
          value: ausd,
        });
        const sent = await backend.run((session) => sendSigned(session, authorization));
        if (sent) setDone(sent.hash);
      }
    } catch (e) {
      setFailed(e instanceof Error ? (e.message.split("\n")[0] ?? null) : "Could not send.");
    } finally {
      setSending(false);
    }
  };

  if (done) {
    return (
      <div className="flex flex-1 flex-col">
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <TransactionStatus status="confirmed" size="large" href={explorerTx(done)} />
          <p className="mt-3 text-[14px] text-muted">
            Sent {formatAusd(ausd)} USD. It is already in their account.
          </p>
        </div>
        <Button onClick={() => router.push("/home")}>Done</Button>
      </div>
    );
  }

  const error = failed ?? backend.error;
  return (
    <div className="flex flex-1 flex-col">
      <SubHeader title="Send" />

      <div
        className={`mb-3 flex items-center gap-2 rounded-[16px] border bg-white px-4 py-3 ${
          recipient && (!valid || self) ? "border-neg" : "border-line"
        }`}
      >
        <label className="min-w-0 grow">
          <span className="block text-[11.5px] font-medium text-muted">Their Matocard account</span>
          <input
            value={to}
            onChange={(event) => setTo(event.target.value)}
            placeholder="0x…"
            spellCheck={false}
            autoComplete="off"
            className="mt-0.5 w-full bg-transparent font-mono text-[14px] outline-none placeholder:text-faint"
          />
        </label>
        <QrScanButton onFound={setTo} />
      </div>
      {self ? (
        <p className="-mt-1 mb-2 text-center text-[12.5px] text-neg">That is your own account.</p>
      ) : null}

      {hasBalance ? (
        <Segmented
          options={SOURCES}
          value={source}
          onChange={setSource}
          label="Send"
          variant="period"
          renderLabel={(s) => SOURCE_LABEL[s]}
          className="mb-2"
        />
      ) : null}

      <Keypad
        value={amount}
        onChange={(next) => setAmount(next.replace(".", ""))}
        symbol="Rp"
        invalid={tooMuch}
        hint={
          source === "card"
            ? `Your card has ${formatAusd(credit.available ?? 0n)} USD available`
            : `Your balance is ${formatAusd(credit.ausdBalance ?? 0n)} USD`
        }
      />
      {/* Reserves its line while empty, so the screen does not jump when typing starts. */}
      <p className="mb-3 min-h-5 text-center text-[13px] text-muted">
        {ausd > 0n
          ? `They get ${formatAusd(ausd)} USD · AUSD, ${formatIdr(rupiah)} at today's rate`
          : null}
      </p>

      {error ? <p className="mb-2 text-center text-[13px] font-medium text-neg">{error}</p> : null}
      <div className="mt-auto">
        <Button onClick={send} disabled={sending || !valid || self || ausd === 0n || tooMuch}>
          {sending ? <PendingLabel status="signing" /> : "Send"}
        </Button>
      </div>
    </div>
  );
}
