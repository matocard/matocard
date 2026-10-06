"use client";
import { useCallback, useState } from "react";
import type { Session } from "../lib/matocard/backend";
import { useSession } from "./useSession";

/**
 * Runs one signed backend call for a screen: signs in first if there is no session yet (one
 * signature, no transaction), tracks `busy`, and keeps the backend's own message as `error`, which
 * the backend promises is safe to show.
 */
export function useBackend() {
  const { session, signIn } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async <T>(call: (session: Session) => Promise<T>): Promise<T | undefined> => {
      setBusy(true);
      setError(null);
      try {
        return await call(session ?? (await signIn()));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
        return undefined;
      } finally {
        setBusy(false);
      }
    },
    [session, signIn],
  );

  return { run, busy, error, clearError: () => setError(null) };
}
