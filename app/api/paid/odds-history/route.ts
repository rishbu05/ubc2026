// x402-protected ($0.01 devnet USDC): odds snapshot for a Gemini prediction-market event.
// GET /api/paid/odds-history?event=<eventTicker>
import { NextRequest, NextResponse } from "next/server";
import { withX402 } from "@x402/next";
import { x402Server, paidRoute } from "@/lib/x402";
import { getEvent } from "@/lib/gemini";

const handler = async (req: NextRequest): Promise<NextResponse<unknown>> => {
  const ticker = req.nextUrl.searchParams.get("event");
  if (!ticker) return NextResponse.json({ error: "event query param required" }, { status: 400 });

  const ev = await getEvent(ticker);
  // TODO: real time series (persist snapshots in Supabase). For now: current point per contract.
  const asOf = new Date().toISOString();
  return NextResponse.json({
    event: ev.ticker,
    title: ev.title,
    series: ev.contracts.map((c) => ({
      instrumentSymbol: c.instrumentSymbol,
      label: c.label,
      points: [
        { t: asOf, bestBid: c.prices?.bestBid, bestAsk: c.prices?.bestAsk, last: c.prices?.lastTradePrice },
      ],
    })),
  });
};

export const GET = withX402(
  handler,
  paidRoute("/api/paid/odds-history", "Odds history for a Gemini prediction-market event"),
  x402Server,
);
