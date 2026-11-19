// Circle developer-controlled wallet that holds the agent's allowance. Server-only.
import "server-only";
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import { USDC_MINT } from "./solana";

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

export async function getAgentBalances() {
  const res = await getCircle().getWalletTokenBalance({ id: agentWalletId() });
  return res.data?.tokenBalances ?? [];
}

/** Send devnet USDC from the agent wallet. `amountUsdc` is in human units. */
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
