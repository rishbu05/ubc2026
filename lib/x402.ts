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

export const PAY_TO = process.env.X402_PAY_TO_ADDRESS ?? "";

/** Route config helper: `paidRoute("/api/paid/weather", "$0.01", "Weather data")`. */
export function paidRoute(path: string, price: string, description: string) {
  return {
    [path]: {
      accepts: { scheme: "exact", payTo: PAY_TO, price, network: SOLANA_CAIP2 },
      description,
    },
  };
}
