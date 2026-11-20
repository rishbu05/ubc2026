// x402-protected ($0.01 devnet USDC): recorded odds history from Supabase `odds_snapshots`.
//
// GET /api/paid/odds-history
//   ?symbol=GEMI-FED261211-HIKE25      one contract, or
//   ?event_ticker=FED261211            all contracts in an event (default: FED261211)
//   &since=2026-11-19T23:45:00Z        optional, rows with ts >= since
//   &limit=500                         optional, 1-5000 (default 500)
// Ordered by ts ascending. Without `since`, returns the most recent `limit` rows.
//
// Params are validated BEFORE the x402 paywall, so a bad request is rejected without charging.
import { NextRequest, NextResponse } from "next/server";
import { withX402 } from "@x402/next";
import { x402Server, paidRoute } from "@/lib/x402";
import { getOddsHistory, parseOddsQuery } from "@/lib/odds";

const paidHandler = withX402(
  async (req: NextRequest): Promise<NextResponse<unknown>> => {
    const parsed = parseOddsQuery(req.nextUrl.searchParams);
    if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const { query } = parsed;
    try {
      const history = await getOddsHistory(query);
      return NextResponse.json({
        symbol: query.symbol ?? null,
        eventTicker: query.eventTicker ?? null,
        since: query.since ?? null,
        limit: query.limit,
        source: "Gemini production market data, recorded every minute",
        ...history,
      });
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 502 });
    }
  },
  paidRoute("/api/paid/odds-history", "Recorded odds history for Gemini prediction-market contracts"),
  x402Server,
);

export async function GET(req: NextRequest) {
  const parsed = parseOddsQuery(req.nextUrl.searchParams);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  return paidHandler(req);
}
