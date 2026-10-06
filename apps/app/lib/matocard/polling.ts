/**
 * How often a screen re-asks the chain or the backend, and why it is not one number.
 *
 * Most figures change without telling the browser: a top-up paid at Xendit and credited by the
 * relayer, a card hold ending, vault yield moving the limit, KYC approved by webhook. The only way
 * a screen stays true is to ask again.
 *
 * The rule is the state, not the clock: while something is in flight (a payment, a hold, a pending
 * verification) ask often, because the person is watching for it to land; when nothing is, ask
 * rarely. Ten seconds is a few looks at a one-minute card hold on testnet.
 */

/** Something is in flight and somebody is watching it land. */
export const POLL_ACTIVE = 10_000;

/** Nothing is pending. Slow enough to be free, fast enough that a stale screen is measured in
 *  seconds rather than in however long the tab has been open. */
export const POLL_IDLE = 60_000;

/**
 * The interval to use, given whether anything is pending.
 *
 * A function rather than a ternary at each call site: there are six hooks, and six places to write
 * the same condition is six places for one of them to keep polling at the idle rate through a
 * deposit somebody is waiting on.
 */
export function pollInterval(pending: boolean): number {
  return pending ? POLL_ACTIVE : POLL_IDLE;
}
