import {
  type Address,
  createWalletClient,
  custom,
  type EIP1193RequestFn,
  getAddress,
  type Hex,
  hexToBigInt,
  http,
  numberToHex,
  type TypedDataDefinition,
} from "viem";
import { createConnector } from "wagmi";
import {
  createPasskeyAccount,
  forgetPasskey,
  storedPasskey,
  unlockPasskeyAccount,
} from "../passkey";

/**
 * The passkey account as a wagmi connector, so every screen that already writes through wagmi
 * (`useCredit`, `authorization.ts`, Send, Cash out) works with it unchanged.
 *
 * It answers the few wallet calls the app makes itself: accounts, chain, `personal_sign`,
 * `eth_signTypedData_v4` and `eth_sendTransaction`, signing locally with the Mera account and
 * sending over Monad's RPC. Everything else (reads, receipts) is forwarded to the RPC.
 *
 * Signing needs the key, which is in memory only. After a reload the account is known from storage
 * and screens read it straight away; the first signature asks for Face ID once.
 */

export const PASSKEY_CONNECTOR_ID = "passkey";

/** Which way `connect` goes: a new passkey, or one the device already holds. */
let nextConnect: "create" | "signin" = "signin";
export const setPasskeyMode = (mode: "create" | "signin") => {
  nextConnect = mode;
};

let connected = false;

type RpcTx = {
  to?: Address;
  data?: Hex;
  value?: Hex;
  gas?: Hex;
  nonce?: Hex;
  maxFeePerGas?: Hex;
  maxPriorityFeePerGas?: Hex;
  gasPrice?: Hex;
};

const big = (v: Hex | undefined) => (v === undefined ? undefined : hexToBigInt(v));

export function passkeyConnector() {
  return createConnector((config) => {
    const chain = config.chains[0];
    const rpc = http(chain.rpcUrls.default.http[0]);

    const handle = async ({
      method,
      params,
    }: {
      method: string;
      params?: unknown;
    }): Promise<unknown> => {
      const p = (params ?? []) as unknown[];
      switch (method) {
        case "eth_chainId":
          return numberToHex(chain.id);
        case "eth_accounts":
        case "eth_requestAccounts": {
          const saved = storedPasskey();
          return connected && saved ? [saved.address] : [];
        }
        case "wallet_switchEthereumChain":
          return null;
        case "personal_sign": {
          const account = await unlockPasskeyAccount();
          return account.signMessage({ message: { raw: p[0] as Hex } });
        }
        case "eth_signTypedData_v4": {
          const account = await unlockPasskeyAccount();
          const typed = JSON.parse(p[1] as string) as TypedDataDefinition;
          // The EIP712Domain entry is implied by `domain`; viem rejects it in `types`.
          const { EIP712Domain: _, ...types } = typed.types as Record<string, unknown>;
          return account.signTypedData({ ...typed, types } as TypedDataDefinition);
        }
        case "eth_sendTransaction": {
          const account = await unlockPasskeyAccount();
          const tx = p[0] as RpcTx;
          const wallet = createWalletClient({ account, chain, transport: rpc });
          return wallet.sendTransaction({
            to: tx.to,
            data: tx.data,
            value: big(tx.value),
            gas: big(tx.gas),
            nonce: tx.nonce === undefined ? undefined : Number(hexToBigInt(tx.nonce)),
            ...(tx.gasPrice
              ? { gasPrice: big(tx.gasPrice) }
              : {
                  maxFeePerGas: big(tx.maxFeePerGas),
                  maxPriorityFeePerGas: big(tx.maxPriorityFeePerGas),
                }),
          } as Parameters<typeof wallet.sendTransaction>[0]);
        }
        default:
          return rpc({ chain }).request({ method, params } as never);
      }
    };
    const request = handle as EIP1193RequestFn;
    const provider = custom({ request })({ retryCount: 0 });

    return {
      id: PASSKEY_CONNECTOR_ID,
      name: "Passkey",
      type: "passkey",
      async connect({ withCapabilities } = {}) {
        const account =
          nextConnect === "create" ? await createPasskeyAccount() : await unlockPasskeyAccount();
        nextConnect = "signin";
        connected = true;
        const address = getAddress(account.address);
        return {
          accounts: (withCapabilities ? [{ address, capabilities: {} }] : [address]) as never,
          chainId: chain.id,
        };
      },
      async disconnect() {
        connected = false;
        forgetPasskey();
      },
      async getAccounts() {
        const saved = storedPasskey();
        return saved ? [getAddress(saved.address)] : [];
      },
      async getChainId() {
        return chain.id;
      },
      async getProvider() {
        return provider;
      },
      // A reload restores the account from storage; Face ID waits for the first signature.
      async isAuthorized() {
        connected = storedPasskey() !== null;
        return connected;
      },
      async switchChain() {
        return chain;
      },
      onAccountsChanged() {},
      onChainChanged() {},
      onDisconnect() {
        connected = false;
        config.emitter.emit("disconnect");
      },
    };
  });
}
