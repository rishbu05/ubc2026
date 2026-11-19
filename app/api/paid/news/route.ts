// x402-protected ($0.02 devnet USDC): news relevant to a prediction-market event.
// GET /api/paid/news?event=<eventTicker>
import { NextRequest, NextResponse } from "next/server";
import { withX402 } from "@x402/next";
import { x402Server, paidRoute } from "@/lib/x402";

const handler = async (req: NextRequest): Promise<NextResponse<unknown>> => {
  const event = req.nextUrl.searchParams.get("event");
  // TODO: plug in a real news source keyed by event.
  return NextResponse.json({
    event,
    items: [
      {
        headline: "Placeholder headline",
        source: "stub",
        publishedAt: new Date().toISOString(),
        summary: "Replace with a real news feed.",
      },
    ],
  });
};

export const GET = withX402(
  handler,
  paidRoute("/api/paid/news", "News relevant to a prediction-market event"),
  x402Server,
);
