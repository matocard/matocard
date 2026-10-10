/**
 * Local storage keys, all under the `matocard.` prefix so one origin's values never collide with
 * another app's.
 *
 * `pendingRelease` is the only record of a withdrawal that has been signed and not yet claimed,
 * so renaming that key would leave money in a vault with nothing on screen pointing at it. If a
 * key must change, move the old value across before the first read.
 */
export const STORAGE = {
  wallet: "matocard.wallet",
  walletName: "matocard.wallet.name",
  walletId: "matocard.wallet.id",
  onboardingDone: "matocard.onboarding.done",
  remoteOrigin: "matocard.remote.origin.v1",
  pendingRelease: "matocard.release.pending.v1",
  e2eConnected: "matocard.e2e.connected",
  /** Home's headline unit, "local" or "ausd": the swap button's last choice on this device. */
  headlineUnit: "matocard.home.unit",
  /** The signed backend session: `{ wallet, until, signature }`, valid six days. */
  session: "matocard.session.v1",
  /** The passkey account: `{ credentialId, address }`, both public. The key is never stored. */
  passkey: "matocard.passkey.v1",
} as const;
