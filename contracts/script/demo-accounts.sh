#!/usr/bin/env bash
# Prepares the two demo accounts on Monad testnet (PLAN §6.3):
#   Siti, "3 months later": verified, 150 AUSD collateral, three qualifying
#     cycles at 80% of her limit, ending at score 55 and limit 134.529147.
#   Mom: verified, receives every draw, so she holds AUSD to cash out on stage.
#
# Cycles have to be signed by the borrower and last minCycleDuration (60 s on
# testnet), so this runs for about four minutes. Every step checks the receipt
# and reads the state back; it stops at the first mismatch.
#
# Env (contracts/.env): MONAD_RPC_URL, WALLET_PK (admin, KYC and relayer).
# DEMO_SITI_PK and DEMO_MOM_PK are created and appended if missing.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; source .env; set +a

LINE=0x39BED14767138AbA87d1F07b64088e1042239C59
AUSD=0x0c2470065cAD1CdE95062E1203B631C3a06B4f79
RPC=$MONAD_RPC_URL

new_key() { cast wallet new --json | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"][0]["private_key"])'; }
if [ -z "${DEMO_SITI_PK:-}" ]; then DEMO_SITI_PK=$(new_key); echo "DEMO_SITI_PK=$DEMO_SITI_PK" >>.env; fi
if [ -z "${DEMO_MOM_PK:-}" ]; then DEMO_MOM_PK=$(new_key); echo "DEMO_MOM_PK=$DEMO_MOM_PK" >>.env; fi
SITI=$(cast wallet address --private-key "$DEMO_SITI_PK")
MOM=$(cast wallet address --private-key "$DEMO_MOM_PK")
RELAYER=$(cast wallet address --private-key "$WALLET_PK")

send() { # key, then cast send args; fails unless the receipt status is 1
  local key=$1; shift
  local out status hash
  out=$(cast send "$@" --rpc-url "$RPC" --private-key "$key" --json)
  status=$(echo "$out" | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d.get("data",d)["status"])')
  hash=$(echo "$out" | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d.get("data",d)["transactionHash"])')
  [ "$status" = "0x1" ] || { echo "reverted: $hash" >&2; exit 1; }
  echo "$hash"
}
call() { cast call "$LINE" "$@" --rpc-url "$RPC" | cut -d' ' -f1; }
expect() { [ "$2" = "$3" ] || { echo "mismatch: $1 is $2, expected $3" >&2; exit 1; }; echo "  $1 = $2"; }

echo "siti $SITI"
echo "mom  $MOM"

cycles=$(cast call "$LINE" 'accountOf(address)((uint256,uint256,uint256,uint64,uint64,uint64,uint64,uint64,bool,uint64,uint64,uint16))' "$SITI" --rpc-url "$RPC" \
  | tr -d '()' | cut -d, -f6 | tr -d ' ')
if [ "$cycles" != "0" ]; then
  echo "siti already has cycles; nothing to do" >&2
  exit 1
fi

echo "fund gas"
for who in "$SITI" "$MOM"; do send "$WALLET_PK" "$who" --value 0.5ether >/dev/null; done

echo "verify"
for pair in "$SITI:demo-siti" "$MOM:demo-mom"; do
  who=${pair%%:*}
  if [ "$(call 'isVerified(address)(bool)' "$who")" != "true" ]; then
    send "$WALLET_PK" "$LINE" 'setVerified(address,bytes32)' "$who" "$(cast keccak "${pair#*:}")" >/dev/null
  fi
  expect "isVerified($who)" "$(call 'isVerified(address)(bool)' "$who")" true
done

echo "top up 150 AUSD by bank transfer"
send "$WALLET_PK" "$AUSD" 'mint(address,uint256)' "$RELAYER" 150000000 >/dev/null
send "$WALLET_PK" "$AUSD" 'approve(address,uint256)' "$LINE" 150000000 >/dev/null
send "$WALLET_PK" "$LINE" 'depositFor(address,uint256,uint8)' "$SITI" 150000000 0 >/dev/null
expect limitOf "$(call 'limitOf(address)(uint256)' "$SITI")" 100000000

scores=(18 36 55)
for i in 0 1 2; do
  limit=$(call 'limitOf(address)(uint256)' "$SITI")
  amount=$((limit * 8 / 10))
  echo "cycle $((i + 1)): draw $amount of $limit to mom"
  draw=$(send "$DEMO_SITI_PK" "$LINE" 'draw(uint256,address)' "$amount" "$MOM")
  sleep 62
  send "$DEMO_SITI_PK" "$AUSD" 'mint(address,uint256)' "$SITI" "$amount" >/dev/null
  send "$DEMO_SITI_PK" "$AUSD" 'approve(address,uint256)' "$LINE" "$amount" >/dev/null
  repay=$(send "$DEMO_SITI_PK" "$LINE" 'repay(uint256)' "$amount")
  echo "  draw $draw"
  echo "  repay $repay"
  expect scoreOf "$(call 'scoreOf(address)(uint256)' "$SITI")" "${scores[$i]}"
done

expect limitOf "$(call 'limitOf(address)(uint256)' "$SITI")" 134529147
echo "mom holds $(cast call "$AUSD" 'balanceOf(address)(uint256)' "$MOM" --rpc-url "$RPC" | cut -d' ' -f1) tAUSD"
