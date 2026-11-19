// Shared x402 resource server for app/api/paid/* (Solana devnet, exact scheme, USDC).
import "server-only";
import { x402ResourceServer } from "@x402/next";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { ExactSvmScheme } from "@x402/svm/exact/server";
import { SOLANA_CAIP2 } from "./solana";

export const x402Server = new x402ResourceServer(
  new HTTPFacilitatorClient({
    url: process.env.X402_FACILITATOR_URL ?? "https://x402.org/facilitator",
  }),
).register(SOLANA_CAIP2, new ExactSvmScheme());

/** Seller wallet that receives x402 payments (devnet USDC). */
export const PAY_TO = process.env.X402_PAY_TO_ADDRESS ?? "";

/** Prices for app/api/paid/*. "$" prices settle in devnet USDC (x402's default SVM asset). */
export const PAID_PRICES = {
  "/api/paid/odds-history": "$0.01",
  "/api/paid/news": "$0.02",
  "/api/paid/analysis": "$0.05",
} as const;
export type PaidPath = keyof typeof PAID_PRICES;

/** Route config helper: `paidRoute("/api/paid/news", "Market news")`. */
export function paidRoute(path: PaidPath, description: string) {
  return {
    [path]: {
      accepts: { scheme: "exact", payTo: PAY_TO, price: PAID_PRICES[path], network: SOLANA_CAIP2 },
      description,
    },
  };
}
