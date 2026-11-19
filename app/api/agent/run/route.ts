// Agent loop entry point (stub). Pulls active Gemini (exchange) prediction markets and
// checks each spend against lib/policy.ts. "Gemini" here = Gemini exchange, not an LLM.
import { NextRequest, NextResponse } from "next/server";
import { listActiveEvents } from "@/lib/gemini";
import { defaultPolicy, evaluate } from "@/lib/policy";

export async function POST(req: NextRequest) {
  const { task } = (await req.json().catch(() => ({}))) as { task?: string };

  // TODO: agent loop. On a 402 from /api/paid/*, read the price, then:
  //   evaluate(policy, { amountUsdc, resourceUrl, spentTodayUsdc }) ->
  //   allow: pay via lib/circle.ts and retry | require_approval: create /api/approve link | deny: report.
  // Then decide on prediction-market trades via lib/gemini.ts (getOrderBook / placeOrder on sandbox).
  const policy = defaultPolicy();
  void evaluate;

  const events = await listActiveEvents({ limit: 10 });
  const markets = events.data.map((e) => ({
    eventTicker: e.ticker,
    title: e.title,
    contracts: e.contracts.map((c) => ({
      instrumentSymbol: c.instrumentSymbol,
      label: c.label,
      bestBid: c.prices?.bestBid,
      bestAsk: c.prices?.bestAsk,
    })),
  }));

  return NextResponse.json({ task: task ?? null, policy, markets });
}
