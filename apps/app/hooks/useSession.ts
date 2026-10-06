"use client";
import { useCallback, useEffect, useState } from "react";
import { useConfig } from "wagmi";
import { SESSION_SECONDS, type Session, sessionMessage } from "../lib/matocard/backend";
import { STORAGE } from "../lib/storage";
import { useWallet } from "./useWallet";

function stored(wallet: string): Session | null {
  try {
    const raw = window.localStorage.getItem(STORAGE.session);
    if (!raw) return null;
    const s = JSON.parse(raw) as Session;
    // Another account's session, or one about to lapse, is no session.
    const fresh = s.until > Math.floor(Date.now() / 1000) + 60;
    return s.wallet.toLowerCase() === wallet.toLowerCase() && fresh ? s : null;
  } catch {
    return null;
  }
}

/**
 * The backend session for the connected account. The account signs one message (no transaction,
 * nothing sent onchain) and the signature is kept for six days, so reading a screen never asks
 * the wallet for anything. `signIn` is what a screen calls when it needs the backend and `session`
 * is null.
 */
export function useSession() {
  const { address } = useWallet();
  const config = useConfig();
  const [session, setSession] = useState<Session | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Storage is read after mount: it does not exist on the server.
  useEffect(() => {
    setSession(address ? stored(address) : null);
  }, [address]);

  const signIn = useCallback(async () => {
    if (!address) throw new Error("Connect first.");
    setSigningIn(true);
    setError(null);
    try {
      const { signMessage } = await import("wagmi/actions");
      const until = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
      const signature = await signMessage(config, { message: sessionMessage(address, until) });
      const next: Session = { wallet: address, until, signature };
      try {
        window.localStorage.setItem(STORAGE.session, JSON.stringify(next));
      } catch {
        // Storage refused (private mode): the session still works for this visit.
      }
      setSession(next);
      return next;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not sign in.");
      throw e;
    } finally {
      setSigningIn(false);
    }
  }, [address, config]);

  const signOut = useCallback(() => {
    try {
      window.localStorage.removeItem(STORAGE.session);
    } catch {}
    setSession(null);
  }, []);

  return { session, signIn, signOut, signingIn, error };
}
