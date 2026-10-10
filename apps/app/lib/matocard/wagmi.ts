import type { AppKitNetwork } from "@reown/appkit/networks";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
// Imported so the `declare module "wagmi"` augmentation below has a resolved module to attach to;
// TypeScript cannot augment a module the file never loads.
import type { Config } from "wagmi";
import { passkeyConnector } from "./passkey-connector";

/**
 * The wagmi side of the wallet layer. Module scope on purpose: `WagmiAdapter` and `createAppKit`
 * must each run exactly once per page load, and building either inside a component gives you two
 * instances and a connection that drops on re-render.
 *
 * **Wagmi or ethers, never both.** Both adapters register the `eip155` namespace with AppKit, so
 * installing the pair silently breaks connection state. `@reown/appkit-adapter-ethers` was removed
 * when this landed; do not add it back alongside this file.
 *
 * Networks are declared here rather than imported from `viem/chains` because AppKit needs the CAIP
 * shape (`caipNetworkId`, `chainNamespace`) that plain viem chains do not carry.
 *
 * Monad testnet is Matocard's only chain.
 */

/** Monad's public testnet RPC. Override with `NEXT_PUBLIC_MONAD_RPC_URL` if it rate-limits a demo. */
export const MONAD_RPC = process.env.NEXT_PUBLIC_MONAD_RPC_URL || "https://testnet-rpc.monad.xyz";

/** Monad testnet, where the credit line, AUSD and the yield vault live (`@matocard/contracts`). */
export const monadTestnet: AppKitNetwork = {
  id: 10143,
  caipNetworkId: "eip155:10143",
  chainNamespace: "eip155",
  name: "Monad Testnet",
  nativeCurrency: { name: "Testnet MON", symbol: "MON", decimals: 18 },
  // `default` feeds the modal and viem's transport; `chainDefault` is what AppKit's
  // `wallet_addEthereumChain` reads. Omit the second and the add-chain prompt sends an empty
  // rpcUrls array, which every wallet rejects.
  rpcUrls: { default: { http: [MONAD_RPC] }, chainDefault: { http: [MONAD_RPC] } },
  // The explorer every README and run record in this repo links to.
  blockExplorers: { default: { name: "MonadVision", url: "https://testnet.monadvision.com" } },
  contracts: {
    multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11", blockCreated: 251449 },
  },
  testnet: true,
};

/**
 * The one network, so it is AppKit's default. `selectMonad()` in `lib/wallet-reown.ts` also
 * switches to it after connect, through `switchChain`, which falls back to
 * `wallet_addEthereumChain` for a wallet that does not know Monad testnet yet.
 */
export const networks: [AppKitNetwork, ...AppKitNetwork[]] = [monadTestnet];

export const projectId = process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID ?? "";

export const metadata = {
  name: "Matocard",
  description: "A card sized by what you have repaid, not what you hold.",
  // Wallets verify this against the origin they were opened from.
  // The app lives at app.matocard.xyz (#71); matocard.xyz is the landing page.
  url: typeof window === "undefined" ? "https://app.matocard.xyz" : window.location.origin,
  icons: ["https://app.matocard.xyz/brand/matocard-logo.png"],
};

/** `ssr: true` is required under the App Router: without it wagmi hydrates from an empty state and
 *  the first client render disagrees with the server's. */
export const wagmiAdapter = new WagmiAdapter({
  networks,
  projectId,
  ssr: true,
  // The passkey account (#104), the default way in; Reown's wallets stay for those who have one.
  connectors: [passkeyConnector()],
});

export const wagmiConfig: Config = wagmiAdapter.wagmiConfig;

/** Lets `useConfig()`-free call sites reach the same config, and gives wagmi's own types the
 *  concrete config so `useReadContract` infers chain ids instead of `number`. */
declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
