#!/usr/bin/env bash
# A local chain for the backend: anvil with the real contracts, deployed by
# contracts/script/DeployMatoCreditLine.s.sol, and 1,000,000 TestAUSD in the
# treasury (the relayer). Prints the .env lines to use; Ctrl-C stops anvil.
# Needs Foundry and `forge install` done in contracts/ (see contracts/README.md).
set -euo pipefail
cd "$(dirname "$0")/../../../contracts"

PORT=${ANVIL_PORT:-8545}
RPC=http://127.0.0.1:$PORT
# anvil's first dev key: admin, KYC and relayer, like the testnet deployer
PK=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

anvil --port "$PORT" --silent &
ANVIL=$!
trap 'kill $ANVIL' EXIT
until cast chain-id --rpc-url "$RPC" >/dev/null 2>&1; do sleep 0.2; done

out=$(WALLET_PK=$PK AUSD_ADDRESS= forge script script/DeployMatoCreditLine.s.sol --rpc-url "$RPC" --broadcast)
line=$(echo "$out" | awk '$1 == "MatoCreditLine" { print $2 }')
ausd=$(echo "$out" | awk '$1 == "AUSD" { print $2 }')
[ -n "$line" ] && [ -n "$ausd" ] || { echo "$out" >&2; exit 1; }
cast send "$ausd" 'mint(address,uint256)' "$(cast wallet address --private-key $PK)" 1000000000000 \
  --rpc-url "$RPC" --private-key $PK >/dev/null

cat <<ENV

anvil on $RPC. Put these in apps/backend/.env:

RPC_URL=$RPC
CHAIN_ID=31337
CREDIT_LINE_ADDRESS=$line
AUSD_ADDRESS=$ausd
RELAYER_PK=$PK

(from the backend in Docker, use RPC_URL=http://host.docker.internal:$PORT)
ENV
wait $ANVIL
