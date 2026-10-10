import type { LocalAccount } from "viem";
import { STORAGE } from "./storage";

/**
 * The passkey account (PLAN D3, issue #104): Mera turns a passkey's PRF output into 32 secret
 * bytes, and the account is derived from them the way Mera's own guide does (BIP-39 entropy, then
 * BIP-32 at the first Ethereum path). Nothing secret is stored: the same passkey on the same
 * domain gives back the same bytes, so signing in again gives back the same account.
 *
 * What is stored is public: the credential id (so Face ID offers the right passkey) and the
 * address (so a reload can show the account before anyone is asked for Face ID). The key lives in
 * memory only, in a Mera signing session, from the passkey prompt until the tab closes.
 *
 * A passkey is bound to the host it was made on: one made on localhost is not offered on
 * app.matocard.xyz, and the other way round.
 */

export type StoredPasskey = { credentialId: string; address: `0x${string}` };

const ETH_PATH = "m/44'/60'/0'/0/0";

let account: LocalAccount | null = null;

export function storedPasskey(): StoredPasskey | null {
  try {
    const raw = window.localStorage.getItem(STORAGE.passkey);
    return raw ? (JSON.parse(raw) as StoredPasskey) : null;
  } catch {
    return null;
  }
}

function remember(value: StoredPasskey) {
  try {
    window.localStorage.setItem(STORAGE.passkey, JSON.stringify(value));
  } catch {
    // Storage refused (private mode): the account still works until the tab closes.
  }
}

export function forgetPasskey() {
  account = null;
  try {
    window.localStorage.removeItem(STORAGE.passkey);
  } catch {}
}

async function toAccount(prfOutput: Uint8Array): Promise<LocalAccount> {
  const [
    { HDKey },
    { entropyToMnemonic, mnemonicToSeedSync },
    { wordlist },
    mera,
    { toViemAccount },
  ] = await Promise.all([
    import("@scure/bip32"),
    import("@scure/bip39"),
    import("@scure/bip39/wordlists/english.js"),
    import("@category-labs/mera"),
    import("@category-labs/mera/viem"),
  ]);
  const seed = mnemonicToSeedSync(entropyToMnemonic(prfOutput, wordlist));
  const node = HDKey.fromMasterSeed(seed).derive(ETH_PATH);
  if (!node.privateKey) throw new Error("Could not open your account.");
  const session = mera.createSecp256k1SigningSession({ privateKey: node.privateKey });
  node.wipePrivateData();
  return toViemAccount(session);
}

const rpId = () => window.location.hostname;

/** A new passkey and the new account it opens. One Face ID prompt (two on some authenticators). */
export async function createPasskeyAccount(): Promise<LocalAccount> {
  const { createPasskeyWithPrfOutput } = await import("@category-labs/mera");
  const created = await createPasskeyWithPrfOutput({
    rp: { id: rpId(), name: "Matocard" },
    user: { name: "Matocard", displayName: "Matocard" },
  });
  account = await toAccount(created.prfOutput);
  remember({ credentialId: created.credentialId, address: account.address });
  return account;
}

/**
 * Opens the account behind a passkey. With no stored credential the device offers every Matocard
 * passkey it holds (signing in on a new browser); with one, only that passkey is asked.
 */
export async function unlockPasskeyAccount(): Promise<LocalAccount> {
  if (account) return account;
  const { getPasskeyPrfOutput } = await import("@category-labs/mera");
  const saved = storedPasskey();
  const result = await getPasskeyPrfOutput({
    rpId: rpId(),
    ...(saved ? { credential: { credentialId: saved.credentialId } } : {}),
  });
  const opened = await toAccount(result.prfOutput);
  if (saved && opened.address.toLowerCase() !== saved.address.toLowerCase()) {
    throw new Error("That passkey belongs to a different account.");
  }
  account = opened;
  remember({ credentialId: result.credentialId, address: opened.address });
  return opened;
}

/** The account if Face ID has already been given in this tab, without asking again. */
export const openAccount = (): LocalAccount | null => account;
