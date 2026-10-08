/**
 * The Matocard backend (`apps/backend`): one answer per screen, and every fiat leg.
 *
 * Signed-in routes take `Authorization: Matocard <wallet>.<until>.<signature>`, where the account
 * signed `sessionMessage(wallet, until)` once. No passwords and no cookies, which is why the
 * backend can allow any origin. Amounts come back as decimal strings in the smallest unit (AUSD:
 * 6 decimals, IDR: whole rupiah); turn them into bigints with `big`, never `Number`. Every route,
 * with real examples, is at https://api.matocard.xyz/docs (Swagger), and issue #71 maps them to
 * screens.
 */

/** Live at api.matocard.xyz; `NEXT_PUBLIC_MATOCARD_API_URL` points elsewhere (a local backend). */
export const API_URL = (
  process.env.NEXT_PUBLIC_MATOCARD_API_URL || "https://api.matocard.xyz"
).replace(/\/+$/, "");

/**
 * Where a cash-out's AUSD is sent: the backend relayer, which also holds the treasury. The backend
 * checks that a cash-out authorization pays exactly this address (issue #71, `TRUST.md`).
 */
export const TREASURY = (process.env.NEXT_PUBLIC_TREASURY_ADDRESS ||
  "0xcf330A7E5D4eae35250f00B4af96eBcf38347Df1") as `0x${string}`;

/** Must match `sessionMessage` in `apps/backend/src/api.ts` byte for byte. */
export const sessionMessage = (wallet: string, until: number) =>
  `Sign in to Matocard\n${wallet.toLowerCase()}\nuntil ${until}`;

/** The backend accepts at most seven days ahead; six leaves room for a skewed clock. */
export const SESSION_SECONDS = 6 * 24 * 3600;

export type Session = { wallet: string; until: number; signature: `0x${string}` };

export const authorization = (s: Session) => `Matocard ${s.wallet}.${s.until}.${s.signature}`;

/** An error the backend chose to show (its `{ error }`), with the HTTP status. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** A decimal string from the backend as a bigint; null and undefined stay unread. */
export const big = (v: string | number | null | undefined): bigint | undefined =>
  v === null || v === undefined ? undefined : BigInt(v);

async function call<T>(
  path: string,
  init: { method?: "GET" | "POST"; body?: unknown; session?: Session } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (init.body !== undefined) headers["content-type"] = "application/json";
  if (init.session) headers.authorization = authorization(init.session);
  const res = await fetch(`${API_URL}${path}`, {
    method: init.method ?? (init.body === undefined ? "GET" : "POST"),
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok) throw new ApiError(data?.error ?? `The server answered ${res.status}.`, res.status);
  return data as T;
}

// ---------------------------------------------------------------- shapes, as the backend sends them

export type KycStatus = "none" | "pending" | "approved" | "rejected" | "duplicate";

/** `GET /me`: the home screen, straight from the contract plus the user's KYC state. */
export type Me = {
  user: { wallet: string; kyc: KycStatus; country: string | null };
  /** Visual only: 16 digits from an HMAC of the wallet, the same every time, no network behind it. */
  /** Visual only, no card network behind it (#90). `accountNumber` is display only: money still
   *  arrives at the account address. `holder` is null until Didit approves, and for demo accounts. */
  card: {
    number: string;
    holder?: string | null;
    accountNumber?: string;
    expiry?: string;
    cvv?: string;
  };
  verified: boolean;
  score: string;
  ratioBps: string;
  limit: string;
  available: string;
  drawn: string;
  dueAt: string;
  defaulted: boolean;
  cycles: { counted: string; repaid: string };
  collateral: {
    value: string;
    yield: string;
    pendingShares: string;
    pendingUntil: string | null;
  };
  balance: string;
};

/** One indexed event (`apps/indexer/schema.graphql`, `Activity`). */
export type ActivityRow = {
  kind:
    | "Verified"
    | "TopUp"
    | "TopUpCleared"
    | "TopUpReversed"
    | "Draw"
    | "Repay"
    | "CollateralWithdrawn"
    | "YieldFee"
    | "Default";
  amount: string | null;
  shares: string | null;
  counterparty: string | null;
  method: string | null;
  timestamp: string;
  txHash: string;
};

/** A payment or payout the backend holds that is not onchain yet. */
export type InFlightRow = {
  id: string;
  kind: "topup" | "repay" | "cashout" | "merchant";
  method?: string;
  fiat: string;
  currency: "MYR" | "IDR" | "USD";
  ausd: string;
  status: string;
  createdAt: string;
};

export type MyActivity = {
  activity: ActivityRow[];
  /** "unavailable" when the indexer is down or stale: history is missing, not empty. */
  indexer: "ok" | "unavailable";
  inFlight: InFlightRow[];
};

export type Pair = "USD/MYR" | "USD/IDR";
/** A rate locked for 60 seconds: units of the second currency per one USD (AUSD counts as USD). */
export type Quote = { id: string; pair: Pair; rate: string; expiresAt: string };

export type Checkout = { paymentId: string; checkoutUrl: string; fiat: string; ausd: string };

/** An ERC-3009 `transferWithAuthorization` the sender signed; the relayer submits it and pays gas. */
export type TransferAuthorization = {
  from: string;
  to: string;
  value: string;
  validAfter: string;
  validBefore: string;
  nonce: `0x${string}`;
  signature: `0x${string}`;
};

export type BankAccount = { channelCode: string; accountNumber: string; accountHolderName: string };

/** `GET /verify/:wallet`: public, nothing personal, the record only. */
export type VerifyRecord = {
  account: string;
  verified: boolean;
  score: string;
  ratioBps: string;
  cycles: { counted: string; repaid: string };
  defaulted: boolean;
  indexer?: "ok" | "unavailable";
  history: {
    score: string;
    cycleCount: number;
    repayCount: number;
    cyclesOpened: number;
    defaulted: boolean;
    verifiedAt: string | null;
    firstSeenAt: string;
    cycles: {
      number: number;
      outcome: "Open" | "Qualified" | "NotQualified" | "Defaulted";
      openedAt: string;
      closedAt: string | null;
      peakDrawn: string;
      totalRepaid: string;
      scoreAfter: string | null;
      openTxHash: string;
      closeTxHash: string | null;
    }[];
  } | null;
};

// ---------------------------------------------------------------- routes

export const getMe = (session: Session) => call<Me>("/me", { session });

export const getMyActivity = (session: Session) => call<MyActivity>("/me/activity", { session });

export const getQuote = (pair: Pair) => call<Quote>("/quote", { body: { pair } });

/** Where the user lives (ISO two letters, uppercase), chosen at onboarding; can change any time. */
export const setCountry = (session: Session, country: string) =>
  call<{ country: string }>("/me/country", { body: { country }, session });

/** Didit's hosted verification, to open in the KYC sheet. */
export const startKyc = (session: Session) =>
  call<{ url: string }>("/kyc/session", { method: "POST", body: {}, session });

/**
 * A top-up at a locked quote; answers with Xendit's checkout. `amount` is in the quote's smallest
 * unit: whole rupiah for `USD/IDR` (at least Rp 10,000) or sen for `USD/MYR` (`"60000"` = RM 600,
 * at least RM 5). Which Xendit account collects follows the pair (#79). Virtual accounts, QRIS,
 * FPX and DuitNow count at once; a card waits out its hold.
 */
export const startTopUp = (
  session: Session,
  input: { amount: string; method: "card" | "bank" | "qr"; quoteId: string },
) => call<Checkout>("/topups", { body: input, session });

/** Settles the whole debt, rounded up, in the quote's currency (`USD/MYR` or `USD/IDR`). */
export const startSettlement = (session: Session, quoteId: string) =>
  call<Checkout>("/settlements", { body: { quoteId }, session });

/** A plain AUSD send the user signed; the relayer pays the gas. */
export const sendSigned = (session: Session, authorization: TransferAuthorization) =>
  call<{ hash: string }>("/sends", { body: { authorization }, session });

/** Cash out to an Indonesian bank: AUSD signed over to the treasury, rupiah paid out by Xendit.
 *  Always a `USD/IDR` quote. */
export const startCashout = (
  session: Session,
  input: { quoteId: string; authorization: TransferAuthorization; bank: BankAccount },
) => call<{ payoutId: string; ausd: string; fiat: string }>("/cashouts", { body: input, session });

export const getVerifyRecord = (wallet: string) =>
  call<VerifyRecord>(`/verify/${encodeURIComponent(wallet)}`);
