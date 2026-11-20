// x402-protected ($0.02 devnet USDC): real headlines for a market's topic (Google News RSS).
//
// GET /api/paid/news
//   ?event_ticker=FED261211      mapped to a topic (default FED261211), or
//   ?topic=Federal%20Reserve     free-text topic (max 200 chars)
//   &limit=10                    1-20 (default 10)
//   &inject=1                    DEMO: append one prompt-injection headline (also env DEMO_INJECTION=true)
// Headlines are cached for 5 minutes. Params are validated before the paywall (bad request = 400, no charge).
import { NextRequest, NextResponse } from "next/server";
import { withX402 } from "@x402/next";
import { x402Server, paidRoute } from "@/lib/x402";
import { NEWS_CACHE_SECONDS, fetchHeadlines, injectionHeadline, parseNewsQuery } from "@/lib/news";

const paidHandler = withX402(
  async (req: NextRequest): Promise<NextResponse<unknown>> => {
    const parsed = parseNewsQuery(req.nextUrl.searchParams);
    if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const { topic, eventTicker, inject, limit } = parsed.query;
    try {
      const items = await fetchHeadlines(topic, limit);
      if (inject) items.push(injectionHeadline());
      return NextResponse.json({
        topic,
        eventTicker,
        count: items.length,
        cacheSeconds: NEWS_CACHE_SECONDS,
        source: "Google News RSS",
        ...(inject && { demoInjection: true }),
        items,
      });
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 502 });
    }
  },
  paidRoute("/api/paid/news", "Recent headlines for a prediction market's topic"),
  x402Server,
);

export async function GET(req: NextRequest) {
  const parsed = parseNewsQuery(req.nextUrl.searchParams);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  return paidHandler(req);
}
