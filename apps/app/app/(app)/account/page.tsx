"use client";

import { useState } from "react";
import { Identicon } from "../../../components/account/Identicon";
import { LogoutSheet } from "../../../components/account/LogoutSheet";
import { ReceiveSheet } from "../../../components/account/ReceiveSheet";
import { Button } from "../../../components/ui";
import { useCredit } from "../../../hooks/useCredit";
import { useMe } from "../../../hooks/useMe";
import { useNav } from "../../../hooks/useNav";
import { useRedirectDesktopToHome } from "../../../hooks/useRedirectDesktopToHome";
import { useWallet } from "../../../hooks/useWallet";
import { COUNTRIES, localFor } from "../../../lib/matocard/local";

/** "Emak Emak" → "EE": the first letters of the first and last name. */
const initials = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
};

const CURRENCY_NAME = { IDR: "Rupiah", MYR: "Ringgit" } as const;

const Chevron = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    className="shrink-0 text-muted"
    aria-hidden="true"
  >
    <path d="M9 6l6 6-6 6" />
  </svg>
);
const mobilePanel =
  "flex w-full items-center gap-3 rounded-[16px] border border-line bg-white px-4 py-3.5 text-left " +
  "[box-shadow:0_1px_2px_rgba(17,19,22,.04),0_10px_22px_-16px_rgba(17,19,22,.22)]";

/**
 * Account: who you are, how to receive money, and where you live, with no `0x` on the page itself
 * (Axel, 10 Oct). The address only appears in Receive money, where someone needs it.
 */
export default function AccountPage() {
  const nav = useNav();
  const { address, disconnect } = useWallet();
  const credit = useCredit();
  const me = useMe();
  const [confirming, setConfirming] = useState(false);
  const [receiving, setReceiving] = useState(false);
  const redirecting = useRedirectDesktopToHome();

  if (redirecting || !address) return null;

  const name = me.cardHolder ?? "";
  const country = COUNTRIES.find((c) => c.code === me.country)?.name;

  const logout = async () => {
    setConfirming(false);
    await disconnect();
    nav.forward("/");
  };

  return (
    <div>
      <div className="stagger">
        <div className="pb-1.5 pt-3.5 text-center">
          {name ? (
            <div className="mx-auto flex size-[90px] items-center justify-center rounded-full bg-ink text-[30px] font-semibold tracking-[0.02em] text-white">
              {initials(name)}
            </div>
          ) : (
            <Identicon address={address} />
          )}
          {name ? <div className="mt-3 text-[20px] font-semibold">{name}</div> : null}
          {credit.verified ? (
            <div className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-[#EAEAEA] px-2.5 py-1 text-[12px] font-medium text-ink-2">
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M5 12l5 5 9-10" />
              </svg>
              ID verified
            </div>
          ) : null}
        </div>

        <section className="mt-5">
          <div className="flex flex-col gap-2.5">
            <button type="button" onClick={() => setReceiving(true)} className={mobilePanel}>
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="shrink-0"
                aria-hidden="true"
              >
                <rect x="3" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" />
                <path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h4v-3" />
              </svg>
              <span className="min-w-0 grow">
                <span className="block font-semibold">Receive money</span>
                <span className="block text-[12.5px] text-muted">Show your QR to get paid</span>
              </span>
              <Chevron />
            </button>
            <button
              type="button"
              onClick={() => nav.forward("/transactions")}
              className={mobilePanel}
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="shrink-0"
                aria-hidden="true"
              >
                <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
              </svg>
              <span className="min-w-0 grow">
                <span className="block font-semibold">History</span>
                <span className="block text-[12.5px] text-muted">
                  Deposits, spending and payments
                </span>
              </span>
              <Chevron />
            </button>
          </div>
        </section>

        {country ? (
          <section className="mt-5">
            <h2 className="ml-1 mb-2.5 text-sm font-medium text-muted">Details</h2>
            <dl className={`${mobilePanel} flex-col items-stretch gap-0 divide-y divide-line py-1`}>
              <div className="flex justify-between gap-4 py-2.5">
                <dt className="text-[14.5px]">Country</dt>
                <dd className="text-[14.5px] font-semibold">{country}</dd>
              </div>
              <div className="flex justify-between gap-4 py-2.5">
                <dt className="text-[14.5px]">You pay in</dt>
                <dd className="text-[14.5px] font-semibold">
                  {CURRENCY_NAME[localFor(me.country).currency]}
                </dd>
              </div>
            </dl>
          </section>
        ) : null}

        <Button variant="glass" className="mt-4 text-neg!" onClick={() => setConfirming(true)}>
          Log out
        </Button>
      </div>

      <ReceiveSheet open={receiving} onClose={() => setReceiving(false)} address={address} />
      <LogoutSheet open={confirming} onClose={() => setConfirming(false)} onConfirm={logout} />
    </div>
  );
}
