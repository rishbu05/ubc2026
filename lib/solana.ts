// Solana devnet helpers. Everything in this app targets DEVNET.
import { Connection, PublicKey, clusterApiUrl } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import BigNumber from "bignumber.js";

export const SOLANA_NETWORK = "devnet" as const;
/** CAIP-2 id used by x402 for Solana devnet. */
export const SOLANA_CAIP2 =
  (process.env.NEXT_PUBLIC_SOLANA_CAIP2 ??
    "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1") as `solana:${string}`;

export const RPC_URL =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? clusterApiUrl(SOLANA_NETWORK);

/** Circle devnet USDC. */
export const USDC_MINT = new PublicKey(
  process.env.NEXT_PUBLIC_USDC_MINT ??
    "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
);
export const USDC_DECIMALS = 6;

let _connection: Connection | null = null;
export function getConnection(): Connection {
  if (!_connection) _connection = new Connection(RPC_URL, "confirmed");
  return _connection;
}

/** Human USDC (e.g. 0.05) -> base units (50000n). */
export function usdcToBaseUnits(amount: number | string): bigint {
  return BigInt(
    new BigNumber(amount).shiftedBy(USDC_DECIMALS).integerValue(BigNumber.ROUND_DOWN).toFixed(0),
  );
}

/** Base units -> human USDC. */
export function baseUnitsToUsdc(amount: bigint | string): number {
  return new BigNumber(amount.toString()).shiftedBy(-USDC_DECIMALS).toNumber();
}

export function usdcAta(owner: PublicKey): PublicKey {
  return getAssociatedTokenAddressSync(USDC_MINT, owner, true);
}

export async function getUsdcBalance(owner: PublicKey): Promise<number> {
  try {
    const res = await getConnection().getTokenAccountBalance(usdcAta(owner));
    return Number(res.value.uiAmountString ?? 0);
  } catch {
    return 0; // no ATA yet
  }
}
