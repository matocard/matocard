import { join } from "node:path";
import type { SQL } from "bun";
import type { Address } from "viem";
import { loadConfig } from "../src/config";
import { connect, migrate } from "../src/db";

const CONTRACTS = join(import.meta.dir, "../../../contracts");
/** Anvil's first dev key: the deployer, which is admin, KYC and relayer. */
export const DEPLOYER_PK =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as const;

// captured once: testConfig points DATABASE_URL at a throwaway database
const ADMIN_URL = process.env.DATABASE_URL;
export const hasDatabase = Boolean(ADMIN_URL);
export const hasAnvil = Boolean(Bun.which("anvil") && Bun.which("forge"));

/** A throwaway database next to DATABASE_URL, migrated. */
export async function testDatabase() {
  const admin = connect(ADMIN_URL!);
  const name = `matocard_test_${process.pid}_${Math.random().toString(36).slice(2, 8)}`;
  await admin.unsafe(`CREATE DATABASE ${name}`);
  const url = new URL(ADMIN_URL!);
  url.pathname = `/${name}`;
  const sql = connect(url.toString());
  await migrate(sql);
  return {
    sql,
    url: url.toString(),
    async drop() {
      await sql.close();
      await admin.unsafe(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      await admin.close();
    },
  };
}

/** Anvil with the credit line deployed by the real deploy script. */
export async function testChain() {
  const port = 20_000 + Math.floor(Math.random() * 20_000);
  const rpcUrl = `http://127.0.0.1:${port}`;
  const anvil = Bun.spawn(["anvil", "--port", String(port), "--silent"], { stdout: "ignore" });
  for (let i = 0; ; i++) {
    const up = await fetch(rpcUrl, {
      method: "POST",
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
    }).then(
      () => true,
      () => false,
    );
    if (up) break;
    if (i === 50) throw new Error("anvil did not start");
    await Bun.sleep(100);
  }
  const deploy = Bun.spawnSync(
    ["forge", "script", "script/DeployMatoCreditLine.s.sol", "--rpc-url", rpcUrl, "--broadcast"],
    { cwd: CONTRACTS, env: { ...process.env, WALLET_PK: DEPLOYER_PK, AUSD_ADDRESS: "" } },
  );
  const out = deploy.stdout.toString();
  const find = (label: string) => {
    const match = new RegExp(`(?:^|\\s)${label}\\s+(0x[0-9a-fA-F]{40})`, "m").exec(out);
    if (!match) throw new Error(`deploy output has no ${label}:\n${out}${deploy.stderr}`);
    return match[1] as Address;
  };
  return {
    rpcUrl,
    creditLine: find("MatoCreditLine"),
    ausd: find("AUSD"),
    stop: () => anvil.kill(),
  };
}

/** Config for tests: anvil, a test database, and fixed secrets. */
export function testConfig(
  db: { url: string },
  chain?: { rpcUrl: string; creditLine: Address; ausd: Address },
) {
  Object.assign(process.env, {
    DATABASE_URL: db.url,
    RELAYER_PK: DEPLOYER_PK,
    RPC_URL: chain?.rpcUrl ?? "http://127.0.0.1:1",
    CHAIN_ID: "31337",
    CREDIT_LINE_ADDRESS: chain?.creditLine ?? "0x0000000000000000000000000000000000000001",
    AUSD_ADDRESS: chain?.ausd ?? "0x0000000000000000000000000000000000000002",
    IDENTITY_SALT: "test-salt",
    XENDIT_SECRET_KEY: "xnd_development_test",
    XENDIT_CALLBACK_TOKEN: "xendit-token",
    XENDIT_MY_SECRET_KEY: "xnd_development_my",
    XENDIT_MY_CALLBACK_TOKEN: "xendit-my-token",
    DIDIT_API_KEY: "didit-key",
    DIDIT_WORKFLOW_ID: "workflow",
    DIDIT_WEBHOOK_SECRET: "didit-secret",
  });
  return loadConfig();
}

export type { SQL };
