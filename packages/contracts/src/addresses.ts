/** Monad testnet (chain 10143). Talk to the proxy, never the implementation. */
export const monadTestnet = {
  chainId: 10143,
  /** MatoCreditLine proxy (UUPS). */
  matoCreditLine: "0x39BED14767138AbA87d1F07b64088e1042239C59",
  /** Stand-in for AUSD until a testnet faucet exists. 6 decimals, anyone can mint. */
  ausd: "0x0c2470065cAD1CdE95062E1203B631C3a06B4f79",
  /** Stand-in for earnAUSD. */
  yieldVault: "0xe6a522DF58cBea4559521Eb6092962Cf87aaEBee",
  /** Block of the proxy deployment; the indexer starts here. */
  deployBlock: 66_373_390,
} as const;
