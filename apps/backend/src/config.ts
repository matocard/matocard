import { monadTestnet } from "@matocard/contracts";
import { parseAmount } from "@matocard/core";
import { type Address, type Hex, isAddress, isHex, parseEther } from "viem";

const env = (name: string, fallback?: string) => {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === "") throw new Error(`${name} is not set`);
  return value;
};
const optional = (name: string) => process.env[name] || undefined;
const address = (name: string, fallback?: string): Address => {
  const value = env(name, fallback);
  if (!isAddress(value)) throw new Error(`${name} is not an address`);
  return value;
};

export type Config = ReturnType<typeof loadConfig>;

/** Everything the backend reads from the environment, checked once at start. */
export function loadConfig() {
  const relayerKey = env("RELAYER_PK");
  if (!isHex(relayerKey) || relayerKey.length !== 66) throw new Error("RELAYER_PK is not a key");
  return {
    port: Number(env("PORT", "3000")),
    databaseUrl: env("DATABASE_URL"),
    chain: {
      rpcUrl: env("RPC_URL", "https://testnet-rpc.monad.xyz"),
      chainId: Number(env("CHAIN_ID", String(monadTestnet.chainId))),
      creditLine: address("CREDIT_LINE_ADDRESS", monadTestnet.matoCreditLine),
      ausd: address("AUSD_ADDRESS", monadTestnet.ausd),
      relayerKey: relayerKey as Hex,
    },
    caps: {
      // PLAN §7.2 rule 6: AUSD the relayer may credit per UTC day
      perUser: parseAmount(env("DAILY_CAP_USER_AUSD", "1000"), "AUSD"),
      global: parseAmount(env("DAILY_CAP_GLOBAL_AUSD", "20000"), "AUSD"),
    },
    dripWei: parseEther(env("DRIP_MON", "0.1")),
    indexerUrl: optional("INDEXER_URL"),
    xendit: {
      secretKey: optional("XENDIT_SECRET_KEY"),
      callbackToken: optional("XENDIT_CALLBACK_TOKEN"),
      // Xendit needs an account per country of origin: MY collects MYR, ID pays out IDR
      payoutSecretKey: optional("XENDIT_PAYOUT_SECRET_KEY") ?? optional("XENDIT_SECRET_KEY"),
      payoutCallbackToken:
        optional("XENDIT_PAYOUT_CALLBACK_TOKEN") ?? optional("XENDIT_CALLBACK_TOKEN"),
      returnUrl: optional("APP_URL"),
    },
    didit: {
      apiKey: optional("DIDIT_API_KEY"),
      workflowId: optional("DIDIT_WORKFLOW_ID"),
      webhookSecret: optional("DIDIT_WEBHOOK_SECRET"),
    },
    // keeps identity hashes from being brute-forced back into document numbers
    identitySalt: env("IDENTITY_SALT"),
  };
}
