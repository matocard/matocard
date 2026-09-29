/** Monad testnet (chain 10143). Talk to the proxy, never the implementation. */
export const monadTestnet = {
  chainId: 10143,
  /** MatoCreditLine proxy (UUPS). */
  matoCreditLine: "0x142A155055b8aE415118f605e2c85B71c029394C",
  /** Stand-in for AUSD until a testnet faucet exists. 6 decimals, anyone can mint,
   *  with AUSD's permit and ERC-3009 functions. */
  ausd: "0x642dA38444cd6C51a126549ba72b7D3d51E37C9a",
  /** Stand-in for earnAUSD. */
  yieldVault: "0xA5238544faa35C9768bA9984aEd018A96b4A72Ba",
  /** Block of the proxy deployment; the indexer starts here. */
  deployBlock: 66_642_498,
} as const;
