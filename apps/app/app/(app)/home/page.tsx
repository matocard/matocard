"use client";
import { useEffect, useState } from "react";
import { ActivityList } from "../../../components/activity/ActivityList";
import { CardArtwork } from "../../../components/card/CardArtwork";
import { KycSheet } from "../../../components/card/KycSheet";
import { AvailableHero } from "../../../components/home/AvailableHero";
import { BalanceSection } from "../../../components/home/BalanceSection";
import { LimitBreakdown } from "../../../components/home/LimitBreakdown";
import { OwedCard } from "../../../components/home/OwedCard";
import { VerifyCard } from "../../../components/home/VerifyCard";
import { CardFolder } from "../../../components/motion/card-folder";
import { ActionPill, ActionRow, Card, Toast } from "../../../components/ui";
import { useCredit } from "../../../hooks/useCredit";
import { useFx } from "../../../hooks/useFx";
import { useMe } from "../../../hooks/useMe";
import { useMyActivity } from "../../../hooks/useMyActivity";
import { useNav } from "../../../hooks/useNav";
import { setCountry, startKyc } from "../../../lib/matocard/backend";
import { localFor } from "../../../lib/matocard/local";

/** A unix-seconds timestamp as "3 Nov". Formatted after mount only, where the screen renders. */
const day = (seconds: bigint) =>
  new Date(Number(seconds) * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

/**
 * Home (PLAN §8): what you can spend, why, what you owe, and what happened. Figures that the
 * user acts on come from the chain (`useCredit`); KYC, country and the card number come from the
 * backend (`useMe`); local-currency figures use one shared display rate (`useFx`) for the
 * currency of where the user lives.
 */
export default function HomePage() {
  const nav = useNav();
  const credit = useCredit();
  const me = useMe();
  const local = localFor(me.country);
  const { rate } = useFx(local.pair);
  const [cardShown, setCardShown] = useState(false);
  const activity = useMyActivity();
  const [kycUrl, setKycUrl] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The clock is read after mount: the hold's end and the due date are compared with it.
  const [now, setNow] = useState<bigint>();
  useEffect(() => setNow(BigInt(Math.floor(Date.now() / 1000))), []);

  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 4000);
    return () => clearTimeout(timer);
  }, [error]);

  // Didit answers by webhook, never to this tab, so the screen re-reads on the way back.
  useEffect(() => {
    const onFocus = () => {
      void me.refresh();
      void credit.refresh();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [me.refresh, credit.refresh]);

  const signIn = async () => {
    try {
      await me.signIn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not sign in.");
    }
  };

  const chooseCountry = async (code: string) => {
    setStarting(true);
    try {
      const session = me.session ?? (await me.signIn());
      await setCountry(session, code);
      await me.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save that.");
    } finally {
      setStarting(false);
    }
  };

  const verify = async () => {
    setStarting(true);
    try {
      const session = me.session ?? (await me.signIn());
      const { url } = await startKyc(session);
      setKycUrl(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start verification.");
    } finally {
      setStarting(false);
    }
  };

  // The contract is the authority on verification; the backend's KYC state explains the wait.
  const verified = credit.verified === true;
  const owes = (credit.drawn ?? 0n) > 0n;
  const held =
    now !== undefined &&
    credit.collateral &&
    credit.collateral.pendingShares > 0n &&
    credit.collateral.pendingUntil > now;
  const preview = activity.items.slice(0, 3);

  return (
    <div>
      <div className="stagger">
        <AvailableHero
          available={credit.available}
          rate={rate}
          currency={local.currency}
          issued={verified}
        />

        {verified ? (
          <ActionRow className="mb-[22px]">
            <ActionPill
              primary
              onClick={() => nav.forward("/send")}
              disabled={(credit.available ?? 0n) === 0n}
            >
              Send
            </ActionPill>
            <ActionPill onClick={() => nav.forward("/topup")}>Top up</ActionPill>
            {owes ? <ActionPill onClick={() => nav.forward("/settle")}>Settle</ActionPill> : null}
          </ActionRow>
        ) : null}

        {verified ? (
          <div className="mb-[26px] flex justify-center">
            <CardFolder
              title=""
              ariaLabel="Your card"
              cardNumber={me.cardNumber ?? ""}
              expiry="••/••"
              cvv="•••"
              detailsVisible={cardShown}
              onDetailsVisibleChange={setCardShown}
              className="w-full max-w-[340px]"
              card={
                <CardArtwork
                  holder=""
                  number={me.cardNumber}
                  expiry="••/••"
                  detailsVisible={cardShown}
                />
              }
            />
          </div>
        ) : credit.loading ? null : (
          <VerifyCard
            className="mb-[26px]"
            signedIn={Boolean(me.session)}
            country={me.country}
            kyc={me.kyc}
            busy={starting || me.signingIn}
            onSignIn={signIn}
            onCountry={chooseCountry}
            onVerify={verify}
          />
        )}

        {owes && credit.drawn !== undefined ? (
          <OwedCard
            className="mb-[22px]"
            drawn={credit.drawn}
            dueDate={credit.dueAt && credit.dueAt > 0n && now ? day(credit.dueAt) : null}
            rate={rate}
            currency={local.currency}
            onSettle={() => nav.forward("/settle")}
          />
        ) : null}

        {verified ? (
          <LimitBreakdown
            className="mb-[22px]"
            collateral={credit.collateral?.value}
            score={credit.score}
            ratioBps={credit.ratioBps}
            limit={credit.limit}
            yieldEarned={me.collateral?.yield}
            heldUntil={held && credit.collateral ? day(credit.collateral.pendingUntil) : null}
            rate={rate}
            currency={local.currency}
          />
        ) : null}

        {/* Money sent to this account (Mom's side of a send) lands here, as AUSD. */}
        {credit.ausdBalance !== undefined && credit.ausdBalance > 0n ? (
          <BalanceSection
            className="mb-[22px]"
            balance={credit.ausdBalance}
            rate={rate}
            currency={local.currency}
          />
        ) : null}

        <h2 className="mx-1 mb-2 text-sm font-medium text-muted">Activity</h2>
        <Card className="px-5 pb-2 pt-1">
          <ActivityList
            items={preview}
            loading={activity.loading}
            emptyTitle={me.session ? "Nothing yet" : "Sign in to see your activity"}
            emptyDescription={
              activity.indexerDown
                ? "History is catching up. Payments still in progress are shown."
                : "Top-ups, sends and settlements will show here."
            }
          />
          {activity.items.length > 3 ? (
            <button
              type="button"
              onClick={() => nav.forward("/transactions")}
              className="mt-1.5 flex w-full items-center justify-center border-t border-line pb-[3px] pt-[13px] text-[13.5px] font-medium text-muted"
            >
              View all activity
            </button>
          ) : null}
        </Card>
      </div>

      <KycSheet
        open={Boolean(kycUrl)}
        url={kycUrl}
        verified={verified}
        onClose={() => setKycUrl(null)}
        onPoll={() => {
          void me.refresh();
          void credit.refresh();
        }}
      />
      <Toast open={Boolean(error)} message={error ?? ""} />
    </div>
  );
}
