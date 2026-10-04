/**
 * One row in the activity list, built by `useMyActivity` from `/me/activity`.
 *
 * `kind` is a machine kind (`sent`, `settled`, `topup`, …) that `ActivityRow` titles and draws.
 * `cat` is always `"you"` and stays only because `ActivityList` still renders the distinction.
 * `group` is what the history filter sorts on.
 */
export interface ActivityItem {
  id: number;
  cat: "you" | "auto";
  kind: string;
  detail: string;
  when: string;
  /** Epoch ms. `when` is the rendered relative string; this is what date grouping sorts and splits
   *  on, because "3h ago" cannot tell you which day it was. */
  at?: number;
  flag?: boolean;
  /** Block explorer link for a row that came off a chain. */
  href?: string;
  /** Which part of the product the row belongs to, for the transactions filter. */
  group?: "card" | "deposit";
}
