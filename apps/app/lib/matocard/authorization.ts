import { type Address, toHex } from "viem";
import type { Config } from "wagmi";
import { readContract, signTypedData } from "wagmi/actions";
import type { TransferAuthorization } from "./backend";
import { AUSD, ausdAbi, MONAD_CHAIN_ID } from "./monad";

const TYPES = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

/**
 * Signs an AUSD `transferWithAuthorization` (ERC-3009, D11): the user signs, the backend's relayer
 * submits it and pays the gas, so a send needs no MON and no approval. Used by `POST /sends` (to
 * anyone) and `POST /cashouts` (to the treasury, valid at least five minutes).
 *
 * The EIP-712 domain is read from the token rather than written here: real AUSD's is named
 * `Agora Dollar`, not `AUSD`, and a wrong name produces a signature that simply fails onchain.
 */
export async function signTransfer(
  config: Config,
  input: { from: Address; to: Address; value: bigint; validForSeconds?: number },
): Promise<TransferAuthorization> {
  const [, name, version] = await readContract(config, {
    address: AUSD,
    abi: ausdAbi,
    functionName: "eip712Domain",
    chainId: MONAD_CHAIN_ID,
  });
  const message = {
    from: input.from,
    to: input.to,
    value: input.value,
    validAfter: 0n,
    validBefore: BigInt(Math.floor(Date.now() / 1000) + (input.validForSeconds ?? 3600)),
    // Random, never a counter: ERC-3009 nonces are single-use and unordered.
    nonce: toHex(crypto.getRandomValues(new Uint8Array(32))),
  };
  const signature = await signTypedData(config, {
    account: input.from,
    domain: { name, version, chainId: MONAD_CHAIN_ID, verifyingContract: AUSD },
    types: TYPES,
    primaryType: "TransferWithAuthorization",
    message,
  });
  // The backend takes every bigint as a decimal string.
  return {
    from: message.from,
    to: message.to,
    value: message.value.toString(),
    validAfter: "0",
    validBefore: message.validBefore.toString(),
    nonce: message.nonce,
    signature,
  };
}
