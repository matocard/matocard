import { POLL_ACTIVE, POLL_IDLE, pollInterval } from "../../lib/matocard/polling";

/**
 * The rule every polling hook shares, pinned in one place.
 *
 * The screens read chains and an indexer, and nothing on either pushes. A deposit landing, a relay
 * delivering, an operator approving a release: each is somebody else's clock, and the only thing
 * that keeps a figure true is asking again. The bug this exists to prevent is the opposite of a
 * wrong number, it is a right number that stopped being right an hour ago.
 */

test("hurries while something is in flight and goes quiet when nothing is", () => {
  expect(pollInterval(true)).toBe(POLL_ACTIVE);
  expect(pollInterval(false)).toBe(POLL_IDLE);
});

test("the active rate is fast enough to watch a one-minute card hold end", () => {
  // A card top-up waits about a minute on testnet, so the active rate has to divide that window
  // several times over. Anything coarser and the screen reports a cleared top-up as still held
  // for longer than the hold itself took.
  expect(POLL_ACTIVE).toBeLessThanOrEqual(15_000);
  expect(60_000 / POLL_ACTIVE).toBeGreaterThanOrEqual(4);
});

test("the idle rate is slower than the active one, and bounded", () => {
  // The idle rate has to leave the RPC and the backend alone between changes, and still be short
  // enough that a stale screen is measured in seconds rather than in how long the tab has been open.
  expect(POLL_IDLE).toBeGreaterThan(POLL_ACTIVE);
  expect(POLL_IDLE).toBeLessThanOrEqual(120_000);
});
