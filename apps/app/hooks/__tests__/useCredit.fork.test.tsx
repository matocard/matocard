// End to end for the contract calls the app signs itself, on a fork of Monad testnet:
//   anvil --fork-url https://testnet-rpc.monad.xyz --chain-id 10143 --port 8645
//   FORK_RPC=http://127.0.0.1:8645 bun run test:fork
// The real credit line, AUSD and vault, with the app's own `useCredit` and `signTransfer` driving
// them through wagmi. The account is set up by impersonating the backend's relayer (KYC_ROLE), so
// nothing touches the real testnet.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import {
  createTestClient,
  defineChain,
  erc20Abi,
  getAddress,
  http,
  keccak256,
  parseEther,
  publicActions,
  toHex,
  walletActions,
} from "viem";
import { monadTestnet as viemMonad } from "viem/chains";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { createConfig, WagmiProvider } from "wagmi";
import { connect, getAccount } from "wagmi/actions";
import { mock } from "wagmi/connectors";
import { signTransfer } from "../../lib/matocard/authorization";
import { AUSD, ausdAbi, CREDIT_LINE, creditLineAbi } from "../../lib/matocard/monad";

const FORK = process.env.FORK_RPC;
/** Anvil's first dev account: unlocked, so the node signs for it. */
const USER = getAddress("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266");
const MOM = getAddress("0x00000000000000000000000000000000000000Aa");
/** The backend's relayer (TRUST.md): KYC_ROLE, RELAYER_ROLE, and the treasury's AUSD. */
const RELAYER = getAddress("0xcf330A7E5D4eae35250f00B4af96eBcf38347Df1");
const AUSD_ = (n: number) => BigInt(n) * 1_000_000n;

vi.mock("../useWallet", () => ({ useWallet: () => ({ address: USER }) }));

// jsdom replaces AbortSignal, and Node's Request and fetch refuse jsdom's. viem builds a Request
// with a timeout signal on every RPC call (wagmi's mock connector too), so in this file both drop
// the signal. The fork answers in milliseconds; nothing here relies on the timeout.
const NodeRequest = globalThis.Request;
const nodeFetch = globalThis.fetch;
const unsignalled = (init?: RequestInit) => (init ? { ...init, signal: undefined } : init);
globalThis.Request = class extends NodeRequest {
  constructor(input: RequestInfo | URL, init?: RequestInit) {
    super(input, unsignalled(init));
  }
} as typeof Request;
globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
  nodeFetch(input, unsignalled(init))) as typeof fetch;
const transport = () => http(FORK);

const chain = defineChain({
  ...viemMonad,
  rpcUrls: { default: { http: [FORK ?? "http://127.0.0.1:8645"] } },
});
const node = createTestClient({ mode: "anvil", chain, transport: transport(), cacheTime: 0 })
  .extend(publicActions)
  .extend(walletActions);
const config = createConfig({
  chains: [chain],
  connectors: [mock({ accounts: [USER], features: { reconnect: true } })],
  transports: { [chain.id]: transport() },
  // No persistence: a provider mounting would restore an empty store over the live connection.
  storage: null,
});

const balanceOf = (who: `0x${string}`) =>
  node.readContract({ address: AUSD, abi: erc20Abi, functionName: "balanceOf", args: [who] });
const owed = async () =>
  (
    await node.readContract({
      address: CREDIT_LINE,
      abi: creditLineAbi,
      functionName: "accountOf",
      args: [USER],
    })
  ).drawn;

describe.skipIf(!FORK)("fork: the app's own contract calls against Monad testnet state", () => {
  let snapshot: `0x${string}`;
  afterAll(async () => {
    // Leave the fork as it was, so every run starts from Monad testnet's own state.
    if (snapshot) await node.revert({ id: snapshot });
  });

  beforeAll(async () => {
    snapshot = await node.snapshot();
    await node.setBalance({ address: USER, value: parseEther("10") });
    await node.setBalance({ address: RELAYER, value: parseEther("10") });
    await node.impersonateAccount({ address: RELAYER });
    // KYC: what the backend does after Didit approves, with a fresh identity hash.
    if (
      !(await node.readContract({
        address: CREDIT_LINE,
        abi: creditLineAbi,
        functionName: "isVerified",
        args: [USER],
      }))
    ) {
      const hash = await node.writeContract({
        account: RELAYER,
        address: CREDIT_LINE,
        abi: creditLineAbi,
        functionName: "setVerified",
        args: [USER, keccak256(toHex(`fork-${Date.now()}`))],
      });
      await node.waitForTransactionReceipt({ hash });
    }
    // 300 AUSD from the treasury: 150 becomes collateral, 150 stays to repay from.
    await node.waitForTransactionReceipt({
      hash: await node.writeContract({
        account: RELAYER,
        address: AUSD,
        abi: erc20Abi,
        functionName: "transfer",
        args: [USER, AUSD_(300)],
      }),
    });
    await node.waitForTransactionReceipt({
      hash: await node.writeContract({
        account: USER,
        address: AUSD,
        abi: erc20Abi,
        functionName: "approve",
        args: [CREDIT_LINE, AUSD_(150)],
      }),
    });
    await node.waitForTransactionReceipt({
      hash: await node.writeContract({
        account: USER,
        address: CREDIT_LINE,
        abi: creditLineAbi,
        functionName: "depositCollateral",
        args: [AUSD_(150)],
      }),
    });
  }, 120_000);

  /** The app's hook, mounted fresh for each test inside a real WagmiProvider on the fork. */
  async function mountCredit() {
    const { useCredit } = await import("../useCredit");
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <WagmiProvider config={config} reconnectOnMount={false}>
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      </WagmiProvider>
    );
    const hook = renderHook(() => useCredit(), { wrapper });
    // Connected after the provider mounts, the way a user connects after the page loads.
    if (getAccount(config).status !== "connected") {
      await connect(config, { connector: config.connectors[0]! });
    }
    await waitFor(() => expect(hook.result.current.limit).toBeDefined(), { timeout: 20_000 });
    return () => hook.result.current;
  }

  test("reads the account the way Home shows it", async () => {
    const now = await mountCredit();
    expect(now().verified).toBe(true);
    expect(now().score).toBe(0n);
    expect(now().ratioBps).toBe(15_000n);
    // 150 AUSD of collateral at 150% is a 100 AUSD limit (PLAN §6.3).
    expect(now().limit).toBe(AUSD_(100));
    expect(now().ausdBalance).toBe(AUSD_(150));
  });

  test("draw pays Mom straight from the limit", async () => {
    const now = await mountCredit();
    const before = await balanceOf(MOM);
    await act(async () => {
      await now().draw(AUSD_(50), MOM);
    });
    expect(await balanceOf(MOM)).toBe(before + AUSD_(50));
    expect(await owed()).toBe(AUSD_(50));
  }, 60_000);

  test("repay settles it in one transaction with an AUSD permit", async () => {
    const now = await mountCredit();
    await act(async () => {
      await now().repay();
    });
    expect(await owed()).toBe(0n);
    expect(await balanceOf(USER)).toBe(AUSD_(100));
  }, 60_000);

  test("repayFromCollateral settles a new draw without new money", async () => {
    const now = await mountCredit();
    await act(async () => {
      await now().draw(AUSD_(20), MOM);
    });
    expect(await owed()).toBe(AUSD_(20));
    const userBefore = await balanceOf(USER);
    await act(async () => {
      await now().repayFromCollateral();
    });
    expect(await owed()).toBe(0n);
    expect(await balanceOf(USER)).toBe(userBefore); // paid from collateral, not the balance
  }, 60_000);

  test("withdrawCollateral returns collateral as AUSD", async () => {
    const now = await mountCredit();
    const shares = (now().collateral?.shares ?? 0n) / 10n;
    const before = await balanceOf(USER);
    await act(async () => {
      await now().withdrawCollateral(shares);
    });
    expect(await balanceOf(USER)).toBeGreaterThan(before);
  }, 60_000);

  test("a signTransfer authorization is accepted by AUSD when the relayer submits it", async () => {
    await mountCredit();
    const auth = await signTransfer(config, { from: USER, to: MOM, value: AUSD_(1) });
    const before = await balanceOf(MOM);
    const hash = await node.writeContract({
      account: RELAYER,
      address: AUSD,
      abi: ausdAbi,
      functionName: "transferWithAuthorization",
      args: [
        USER,
        MOM,
        BigInt(auth.value),
        BigInt(auth.validAfter),
        BigInt(auth.validBefore),
        auth.nonce,
        auth.signature,
      ],
    });
    expect((await node.waitForTransactionReceipt({ hash })).status).toBe("success");
    expect(await balanceOf(MOM)).toBe(before + AUSD_(1));
  }, 60_000);
});
