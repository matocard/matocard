# contracts

Foundry. Solidity 0.8.30, deployed to Monad testnet (chain 10143).

```sh
forge install foundry-rs/forge-std --no-git
forge install OpenZeppelin/openzeppelin-contracts@v5.4.0 --no-git
forge install OpenZeppelin/openzeppelin-contracts-upgradeable@v5.4.0 --no-git
forge build
forge test
```

`lib/` is not committed; the install commands above restore it, and CI runs the same ones.
