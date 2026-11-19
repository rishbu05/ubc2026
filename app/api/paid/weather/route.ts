// Example x402-protected data endpoint. Returns 402 until a valid devnet USDC payment is attached.
import { NextResponse } from "next/server";
import { withX402 } from "@x402/next";
import { x402Server, paidRoute } from "@/lib/x402";

const handler = async () => {
  return NextResponse.json({ city: "Vancouver", tempC: 9, conditions: "rain" });
};

export const GET = withX402(
  handler,
  paidRoute("/api/paid/weather", "$0.01", "Current weather data"),
  x402Server,
);
