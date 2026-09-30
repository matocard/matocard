/** Monad testnet (chain 10143). Talk to the proxy, never the implementation. */
export const monadTestnet = {
  chainId: 10143,
  /** MatoCreditLine proxy (UUPS). */
  matoCreditLine: "0x4D6279c3DD0369e788C33b3aE1297D4E9abbd01a",
  /** Agora's AUSD on Monad testnet. 6 decimals; cannot be minted, get it from
   *  Agora's faucet `0xd236c18D274E54FAccC3dd9DDA4b27965a73ee6C`. */
  ausd: "0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC",
  /** Stand-in for earnAUSD. */
  yieldVault: "0xF93Dc9038F4209675C3ab7909d0FEE4738Dd7C08",
  /** Block of the proxy deployment; the indexer starts here. */
  deployBlock: 66_922_881,
} as const;
