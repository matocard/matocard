"use client";

import { Fingerprint } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import { Button, CoinBadge, Toast } from "../components/ui";
import type { TokenSym } from "../components/ui/CoinBadge";
import { useWallet } from "../hooks/useWallet";
import { STORAGE } from "../lib/storage";
import { USER_CLOSED_MODAL, WalletError } from "../lib/wallet-error";
import styles from "./Onboarding.module.css";

type TourScreen = {
  title: string;
  body: string;
  visual: ReactNode;
};

const ONBOARDING_DONE_KEY = STORAGE.onboardingDone;

/**
 * Three beats, in the order the product works: top up, watch the limit it buys grow as you repay,
 * spend it. Figures are PLAN §3 and §6.3's demo at 1 USD = Rp 16,000: Rp 2.4m tops up 150 AUSD,
 * which starts at a limit of 100 and reaches 134.52 at score 55.
 */
const TOUR: TourScreen[] = [
  {
    title: "Top up what\nyou can spare",
    body: "It becomes collateral, held as AUSD on Monad and earning while your card is sized against it",
    visual: <CollateralVisual />,
  },
  {
    title: "Your limit is earned,\nnot bought",
    body: "Repay in full and the same collateral buys a bigger limit next time",
    visual: <LimitChartVisual />,
  },
  {
    title: "Spend it\nlike a card",
    body: "What the card is allowed is yours to spend. Pay it back and you keep it",
    visual: <CardVisual />,
  },
];

export default function Landing() {
  const router = useRouter();
  const { connect, connectPasskey, address, hydrated } = useWallet();
  const [mode, setMode] = useState<"tour" | "connect" | null>(null);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // A returning user with a re-verified session skips onboarding entirely (STE-43). The wallet is
  // hydrated (and verified) in WalletProvider, so we only react to it here. `replace`, not `push`,
  // keeps the landing out of history so Back from /home doesn't return to onboarding.
  useEffect(() => {
    if (hydrated && address) router.replace("/home");
  }, [hydrated, address, router]);

  useEffect(() => {
    if (!hydrated || address) return;
    let nextMode: "tour" | "connect" = "tour";
    try {
      nextMode = window.localStorage.getItem(ONBOARDING_DONE_KEY) === "1" ? "connect" : "tour";
    } catch {
      nextMode = "tour";
    }
    const id = window.setTimeout(() => setMode(nextMode), 0);
    return () => window.clearTimeout(id);
  }, [hydrated, address]);

  // Auto-dismiss the connect-error toast so it doesn't linger.
  useEffect(() => {
    if (!error) return;
    const id = setTimeout(() => setError(null), 4000);
    return () => clearTimeout(id);
  }, [error]);

  // Keep `/` as a splash/router while WalletProvider re-verifies a saved session.
  if (!hydrated || address || mode === null) return <SplashScreen />;

  async function enter(open: () => Promise<void>) {
    setError(null);
    setBusy(true);
    try {
      await open();
      router.replace("/home");
    } catch (e) {
      // Dismissing the picker or Face ID (code -1) isn't a failure, so stay quiet.
      if (e instanceof WalletError && e.code === USER_CLOSED_MODAL) return;
      setError(e instanceof Error ? e.message : "Couldn't open your card. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const finishOnboarding = () => {
    try {
      window.localStorage.setItem(ONBOARDING_DONE_KEY, "1");
    } catch {
      /* storage can be unavailable; still let the user continue */
    }
    setMode("connect");
  };

  if (mode === "connect") {
    return (
      <ConnectScreen
        error={error}
        busy={busy}
        onBack={() => setMode("tour")}
        onPasskey={(m) => void enter(() => connectPasskey(m))}
        onWallet={() => void enter(connect)}
      />
    );
  }

  const last = step === TOUR.length - 1;
  const t = TOUR[step];

  return (
    <main className={`${styles.screen} ${styles.tourScreen}`}>
      <div className={styles.onboardingPanel}>
        <header className={styles.tourHeader}>
          {step > 0 ? (
            <button
              type="button"
              aria-label="Back"
              onClick={() => setStep(step - 1)}
              className={styles.backButton}
            >
              <svg
                aria-hidden="true"
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
              >
                <path d="M15 6l-6 6 6 6" />
              </svg>
            </button>
          ) : (
            <span aria-hidden="true" className={styles.headerSpacer} />
          )}
          <BrandMark compact />
          <button type="button" className={styles.skipButton} onClick={finishOnboarding}>
            Skip
          </button>
        </header>

        <section className={styles.tourBody}>
          <div key={step} className={styles.visualStage}>
            {t.visual}
          </div>
          <div className={styles.tourCopy}>
            <h1 className={styles.tourTitle}>{t.title}</h1>
            <p className={styles.tourText}>{t.body}</p>
            <Stepper current={step} total={TOUR.length + 1} />
          </div>
        </section>

        <div className={styles.ctaStack}>
          <Button
            onClick={() => {
              if (!last) {
                setStep(step + 1);
                return;
              }
              finishOnboarding();
            }}
          >
            {last ? "Continue" : "Next"}
          </Button>
        </div>
        <Toast open={!!error} message={error ?? ""} />
      </div>
    </main>
  );
}

function SplashScreen() {
  return (
    <main className={`${styles.screen} ${styles.splashScreen}`} aria-label="Loading Matocard">
      <BrandMark />
      <span className={styles.splashPulse} aria-hidden="true" />
    </main>
  );
}

function ConnectScreen({
  error,
  busy,
  onBack,
  onPasskey,
  onWallet,
}: {
  error: string | null;
  busy: boolean;
  onBack: () => void;
  onPasskey: (mode: "create" | "signin") => void;
  onWallet: () => void;
}) {
  return (
    <main className={`${styles.screen} ${styles.tourScreen} ${styles.connectScreen}`}>
      <div className={styles.onboardingPanel}>
        <header className={styles.tourHeader}>
          <button type="button" aria-label="Back" onClick={onBack} className={styles.backButton}>
            <svg
              aria-hidden="true"
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
            >
              <path d="M15 6l-6 6 6 6" />
            </svg>
          </button>
          <BrandMark compact />
          <span aria-hidden="true" className={styles.headerSpacer} />
        </header>

        <section className={styles.tourBody}>
          <div key="passkey" className={`${styles.visualStage} ${styles.connectVisualStage}`}>
            <div className={styles.connectVisual} aria-hidden="true">
              <span className={styles.passkeyTile}>
                <Fingerprint size={52} strokeWidth={1.6} />
              </span>
              <span className={styles.walletShadow} />
            </div>
          </div>
          <div className={styles.tourCopy}>
            <h1>Open your card</h1>
            {/* A passkey (#104, the Agora bounty): Face ID or a fingerprint, nothing to write down. */}
            <p>Use Face ID or your fingerprint. There is no password to remember.</p>
            <Stepper current={3} total={TOUR.length + 1} />
          </div>
        </section>
        <div className={styles.ctaStack}>
          <Button onClick={() => onPasskey("create")} disabled={busy}>
            Get started
          </Button>
          <Button variant="glass" onClick={() => onPasskey("signin")} disabled={busy}>
            I have an account
          </Button>
          <button type="button" className={styles.walletLink} onClick={onWallet} disabled={busy}>
            Use a wallet instead
          </button>
        </div>
        <Toast open={!!error} message={error ?? ""} />
      </div>
    </main>
  );
}

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`${styles.brand} ${compact ? styles.brandCompact : ""}`}>
      <Image
        src="/brand/matocard-logo.png"
        alt="Matocard"
        width={512}
        height={512}
        className={styles.brandLogo}
        priority
      />
    </div>
  );
}

function Stepper({ current, total }: { current: number; total: number }) {
  return (
    // A step indicator is a progress bar, not a group of controls, which is
    // both the honest role and the one that carries the numbers.
    <div
      className={styles.stepper}
      role="progressbar"
      aria-valuemin={1}
      aria-valuemax={total}
      aria-valuenow={current + 1}
      aria-label={`Onboarding step ${current + 1} of ${total}`}
    >
      {Array.from({ length: total }).map((_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length literal array, the index is the identity
        <span key={i} className={i === current ? styles.stepActive : ""} />
      ))}
    </div>
  );
}

/**
 * A first top-up, one row per thing it touches, each with its own mark: the rupiah paid in, the
 * AUSD it becomes and the limit that buys (100 at 150% backing, score 0), and the MON the backend
 * drips after verification so fees are never the user's problem (0.5, #69).
 */
function CollateralVisual() {
  return (
    <div className={styles.assetStack} aria-hidden="true">
      <AssetRow asset="Topped up" chain="By bank transfer" value="Rp 2.4m" token="IDR" />
      <AssetRow
        asset="Ready to spend"
        chain="150 AUSD backs it at 150%"
        value="100.00"
        token="AUSD"
        highlight
      />
      <AssetRow asset="Fees covered" chain="Given after you verify" value="0.50" token="MON" />
    </div>
  );
}

/**
 * The card, and the one figure a holder spends against.
 *
 * The two screens before this are about what backs the card and how the limit grows. This one is
 * the proof it can be used: the phone shows Home as it actually renders, and the floating card is
 * a draw that has happened with the repayment still to come, because a limit nobody has spent is
 * a claim rather than a card.
 */
function CardVisual() {
  return (
    <div className={styles.agentPanel} aria-hidden="true">
      <div className={styles.phoneMock}>
        <div className={styles.phoneIsland} />
        <div className={styles.phoneContent}>
          <div className={styles.homeHeroMini}>
            <span>Spendable</span>
            <b>84.52 AUSD</b>
            <em>of 134.52 allowed</em>
          </div>
          <div className={styles.homeButtonMini}>Send</div>
          <span className={styles.homeSectionMini}>Your card</span>
          <div className={styles.cardMini}>
            <span className={styles.cardMiniChip} />
            <b>Matocard</b>
            <em>0000 0000 0000 5058</em>
          </div>
        </div>
      </div>
      <div className={styles.safeExitCard}>
        <span className={styles.safeExitIcon}>
          <svg
            aria-hidden="true"
            width="19"
            height="19"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </span>
        <div className={styles.safeExitText}>
          <strong>Sent 50 AUSD to Mom</strong>
          <span>Pay it back to close the cycle</span>
        </div>
        <b>Repay</b>
      </div>
    </div>
  );
}

function LimitChartVisual() {
  const bars = [28, 34, 42, 49, 55, 62, 68, 73, 79, 84, 89, 94];
  return (
    <div className={styles.chartPanel} aria-hidden="true">
      <div className={styles.chartHeader}>
        <div>
          <span>Your limit</span>
          <strong>134.52 AUSD</strong>
        </div>
        <b>score 55</b>
      </div>
      <div className={styles.earningBars}>
        {bars.map((height, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length literal array, the index is the identity
          <span key={i} style={{ height: `${height}%` }} />
        ))}
      </div>
    </div>
  );
}

function AssetRow({
  asset,
  chain,
  value,
  token,
  highlight = false,
  loading = false,
}: {
  asset: string;
  /** The second line: where the money came from or what it does. */
  chain: string;
  value: string;
  token: TokenSym;
  highlight?: boolean;
  loading?: boolean;
}) {
  return (
    <div className={`${styles.assetRow} ${highlight ? styles.assetRowActive : ""}`}>
      {loading ? (
        <span className={styles.tokenSkeleton} />
      ) : (
        <CoinBadge token={token} size={44} className={styles.tokenLogo} />
      )}
      {loading ? (
        <>
          <span className={`${styles.assetText} ${styles.assetSkeletonText}`}>
            <i />
            <i />
          </span>
          <span className={`${styles.assetValue} ${styles.assetSkeletonValue}`}>
            <i />
            <i />
          </span>
        </>
      ) : (
        <>
          <span className={styles.assetText}>
            <strong>{asset}</strong>
            <span className={styles.assetChain}>{chain}</span>
          </span>
          <span className={styles.assetValue}>
            <b>{value}</b>
          </span>
        </>
      )}
    </div>
  );
}
