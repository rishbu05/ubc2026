// Circle developer-controlled wallet that holds the agent's allowance. Server-only.
// All signing goes through Circle's sign-transaction API (POST /v1/w3s/developer/sign/transaction).
// The private key never leaves Circle.
import "server-only";
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import { createTransactionSigner as createKitSigner } from "@circle-fin/developer-controlled-wallets/solana/kit";
import { createTransactionSigner as createWeb3Signer } from "@circle-fin/developer-controlled-wallets/solana/web3";
import { address, type TransactionPartialSigner } from "@solana/kit";
import { USDC_MINT, agentAddress } from "./solana";

/** Circle's blockchain id for Solana devnet. */
export const CIRCLE_BLOCKCHAIN = "SOL-DEVNET" as const;

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var ${name}`);
  return v;
}

let _client: ReturnType<typeof initiateDeveloperControlledWalletsClient> | null = null;
export function getCircle() {
  if (!_client) {
    _client = initiateDeveloperControlledWalletsClient({
      apiKey: required("CIRCLE_API_KEY"),
      entitySecret: required("CIRCLE_ENTITY_SECRET"),
    });
  }
  return _client;
}

export function agentWalletId(): string {
  return required("CIRCLE_AGENT_WALLET_ID");
}

/** @solana/kit partial signer for the agent wallet (used by the x402 SVM client). */
export function agentKitSigner(): TransactionPartialSigner {
  return createKitSigner({
    client: getCircle(),
    address: address(agentAddress().toBase58()),
    chain: CIRCLE_BLOCKCHAIN,
  });
}

/** @solana/web3.js signer for the agent wallet (used for delegate transfers). */
export function agentWeb3Signer() {
  return createWeb3Signer({
    client: getCircle(),
    address: agentAddress(),
    chain: CIRCLE_BLOCKCHAIN,
  });
}

export async function getAgentBalances() {
  const res = await getCircle().getWalletTokenBalance({ id: agentWalletId() });
  return res.data?.tokenBalances ?? [];
}

/** Send devnet USDC from the agent wallet via Circle's transfer API. `amountUsdc` is in human units. */
export async function sendUsdc(destinationAddress: string, amountUsdc: string) {
  const res = await getCircle().createTransaction({
    // walletId implies the chain (the agent wallet is created on SOL-DEVNET).
    walletId: agentWalletId(),
    tokenAddress: USDC_MINT.toBase58(),
    destinationAddress,
    amount: [amountUsdc],
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
  });
  return res.data;
}
