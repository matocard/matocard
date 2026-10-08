"use client";
import { useQuery } from "@tanstack/react-query";
import { big, getMe, type KycStatus } from "../lib/matocard/backend";
import { POLL_IDLE } from "../lib/matocard/polling";
import { useSession } from "./useSession";

/**
 * `GET /me`: the account as the backend sees it, KYC included. Credit figures here are the
 * contract's, read by the backend; screens that act on them read `useCredit` instead, which goes
 * to the chain directly. What only the backend knows is KYC: `none`, `pending` (stays pending until
 * the identity is bound onchain), `approved`, `rejected` or `duplicate`.
 */
/** How often a pending verification is checked. */
export const KYC_PENDING_POLL = 30_000;

export function useMe() {
  const { session, signIn, signingIn, error: signInError } = useSession();
  const query = useQuery({
    queryKey: ["matocard", "me", session?.wallet],
    queryFn: () => getMe(session!),
    enabled: Boolean(session),
    // `pending` can be hours of manual review at Didit (#89), so it is checked gently: every 30 s,
    // and again whenever the tab regains focus. The KYC sheet polls on its own while it is open.
    refetchInterval: (q) => (q.state.data?.user.kyc === "pending" ? KYC_PENDING_POLL : POLL_IDLE),
  });
  const me = query.data;
  return {
    /** Null until the account has signed in to the backend once. */
    session,
    signIn,
    signingIn,
    loading: Boolean(session) && query.isLoading,
    error: query.error?.message ?? signInError,
    refresh: query.refetch,
    kyc: me?.user.kyc as KycStatus | undefined,
    /** Null once read and not chosen yet; undefined while unread. */
    country: me ? me.user.country : undefined,
    /** 16 digits, visual only (`/me` derives it from the wallet). */
    cardNumber: me?.card?.number,
    verified: me?.verified,
    score: big(me?.score),
    ratioBps: big(me?.ratioBps),
    limit: big(me?.limit),
    available: big(me?.available),
    drawn: big(me?.drawn),
    dueAt: big(me?.dueAt),
    collateral: me && {
      value: big(me.collateral.value),
      /** Collateral yield so far, net of the fee. */
      yield: big(me.collateral.yield),
      pendingShares: big(me.collateral.pendingShares),
      pendingUntil: big(me.collateral.pendingUntil),
    },
    balance: big(me?.balance),
  };
}
