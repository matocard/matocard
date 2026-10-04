#!/usr/bin/env bash
# Checks the relayer's MON. It pays the gas of every backend transaction and
# drips DRIP_MON to each newly verified user, so when it runs dry sign-ups and
# top-ups stop without an error anyone sees. Below MIN_MON: opens one issue (or
# leaves the open one alone) and exits 1. Topped up: closes that issue.
#
# Env: GH_TOKEN (issues: write), MIN_MON (default 2, four sign-ups at 0.5),
# RELAYER (default the backend's relayer, see contracts/TRUST.md), RPC (default
# the public Monad testnet endpoint), DRY_RUN=1 to only print.
set -euo pipefail

MIN_MON=${MIN_MON:-2}
RELAYER=${RELAYER:-0xcf330A7E5D4eae35250f00B4af96eBcf38347Df1}
RPC=${RPC:-https://testnet-rpc.monad.xyz}
TITLE="Relayer is low on MON"

wei_hex=$(curl -sf -m 20 -X POST "$RPC" -H 'content-type: application/json' \
  -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"eth_getBalance\",\"params\":[\"$RELAYER\",\"latest\"]}" | jq -r .result)
# python for the arithmetic: a balance in wei overflows bash's 64-bit integers
read -r mon low < <(python3 -c "w=int('$wei_hex',16); print(f'{w/1e18:.4f}', int(w < $MIN_MON*10**18))")
echo "relayer $RELAYER holds $mon MON (limit $MIN_MON)"

if [ "${DRY_RUN:-0}" = 1 ]; then
  [ "$low" = 0 ]
  exit
fi

open=$(gh issue list --state open --search "\"$TITLE\" in:title" --json number -q '.[0].number // empty')

if [ "$low" = 1 ]; then
  if [ -z "$open" ]; then
    gh issue create --title "$TITLE" --label backend --body "The relayer \`$RELAYER\` holds **$mon MON**, under the limit of $MIN_MON.

It pays the gas of \`setVerified\`, \`depositFor\`, \`repayFor\`, sends and cash-outs, and drips MON to every newly verified user. When it runs out, sign-ups and top-ups stop.

Send it testnet MON from the Monad faucet. This issue closes itself once it is back over the limit."
  fi
  exit 1
fi

if [ -n "$open" ]; then
  gh issue close "$open" --comment "Topped up: $mon MON."
fi
