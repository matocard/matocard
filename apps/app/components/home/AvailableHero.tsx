"use client";
import { ArrowUpDown } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { EASE_OUT } from "../../lib/ease";
import { approxLocal, formatAusd, type LocalCurrency } from "../../lib/matocard/money";
import { STORAGE } from "../../lib/storage";

type Unit = "local" | "ausd";

const CURRENCY_NAME: Record<LocalCurrency, string> = { IDR: "rupiah", MYR: "ringgit" };

/**
 * Home's headline: what the card can spend right now (`availableOf`), in the user's own currency
 * first (ringgit for Siti in Kuala Lumpur, rupiah in Indonesia) because that is the money they
 * think in (PLAN §3; no "≈", Axel's call on 9 Oct). The AUSD figure sits under it, one unit rather
 * than "USD · AUSD" (Axel, 9 Oct): the Agora bounty needs an AUSD balance on screen.
 *
 * The swap button beside it trades the two places, with the figures rolling past each other
 * (Axel, 10 Oct). The choice is kept on this device; reading it back is a convenience, so a
 * blocked `localStorage` just starts in local currency.
 *
 * An unread figure is a dash. `0` is a claim about someone's money.
 */
export function AvailableHero({
  available,
  rate,
  currency,
  issued,
}: {
  available: bigint | undefined;
  /** USD to the user's own currency; without it the AUSD figure leads and there is no swap. */
  rate: string | undefined;
  currency: LocalCurrency;
  /** False before identity is verified: there is no card to spend from yet. */
  issued: boolean;
}) {
  const reduceMotion = useReducedMotion() ?? false;
  const [unit, setUnit] = useState<Unit>("local");
  useEffect(() => {
    try {
      if (window.localStorage.getItem(STORAGE.headlineUnit) === "ausd") setUnit("ausd");
    } catch {}
  }, []);
  const swap = () => {
    const next: Unit = unit === "local" ? "ausd" : "local";
    setUnit(next);
    try {
      window.localStorage.setItem(STORAGE.headlineUnit, next);
    } catch {}
  };

  const local = approxLocal(available, rate, currency);
  const ausd = available === undefined ? "" : `${formatAusd(available)} AUSD`;
  // No rate yet: AUSD leads, and there is nothing to swap with.
  const showAusd = unit === "ausd" || !local;
  const [big, small] = showAusd ? [ausd, local] : [local, ausd];
  const roll = (from: number) => ({
    initial: { opacity: 0, y: reduceMotion ? 0 : `${from}%`, filter: "blur(4px)" },
    animate: { opacity: 1, y: "0%", filter: "blur(0px)" },
    exit: { opacity: 0, y: reduceMotion ? 0 : `${-from}%`, filter: "blur(4px)" },
    transition: { duration: reduceMotion ? 0.12 : 0.32, ease: EASE_OUT },
  });

  return (
    <div className="py-[26px]">
      <div className="text-[15px] font-medium text-muted">{issued ? "Available" : "Your card"}</div>
      {!issued ? (
        <div className="mt-2 text-[clamp(26px,8vw,34px)] font-semibold leading-tight tracking-[-.02em]">
          Not issued yet
        </div>
      ) : available === undefined ? (
        <div className="mt-2 text-[clamp(32px,12vw,54px)] font-semibold leading-none">—</div>
      ) : (
        <>
          <div className="mt-2 flex items-center gap-3">
            <div className="relative overflow-hidden whitespace-nowrap text-[clamp(30px,10vw,50px)] font-semibold leading-[1.1] tracking-[-.02em] [font-variant-numeric:tabular-nums]">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.div key={big} {...roll(60)}>
                  {big}
                </motion.div>
              </AnimatePresence>
            </div>
            {local ? (
              <motion.button
                type="button"
                onClick={swap}
                aria-label={showAusd ? `Show in ${CURRENCY_NAME[currency]}` : "Show in AUSD"}
                whileTap={{ scale: 0.9 }}
                className="flex size-9 shrink-0 items-center justify-center rounded-full bg-card text-ink shadow-[0_1px_2px_rgba(0,0,0,0.08)]"
              >
                <motion.span
                  animate={{ rotate: showAusd ? 180 : 0 }}
                  transition={{ duration: reduceMotion ? 0 : 0.32, ease: EASE_OUT }}
                  className="flex"
                >
                  <ArrowUpDown size={17} strokeWidth={2} aria-hidden="true" />
                </motion.span>
              </motion.button>
            ) : null}
          </div>
          {small ? (
            <div className="relative mt-2 overflow-hidden text-[14px] text-muted [font-variant-numeric:tabular-nums]">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.div key={small} {...roll(-60)}>
                  {small}
                </motion.div>
              </AnimatePresence>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
