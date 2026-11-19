// x402-protected ($0.05 devnet USDC): order-book analysis for a Gemini prediction contract.
// GET /api/paid/analysis?symbol=<instrumentSymbol>
import { NextRequest, NextResponse } from "next/server";
import { withX402 } from "@x402/next";
import { x402Server, paidRoute } from "@/lib/x402";
import { getOrderBook } from "@/lib/gemini";

const handler = async (req: NextRequest): Promise<NextResponse<unknown>> => {
  const symbol = req.nextUrl.searchParams.get("symbol");
  if (!symbol) return NextResponse.json({ error: "symbol query param required" }, { status: 400 });

  const book = await getOrderBook(symbol, 20);
  const bestBid = book.bids[0] ? Number(book.bids[0].price) : null;
  const bestAsk = book.asks[0] ? Number(book.asks[0].price) : null;
  const depth = (levels: typeof book.bids) => levels.reduce((s, l) => s + Number(l.amount), 0);
  const bidDepth = depth(book.bids);
  const askDepth = depth(book.asks);

  return NextResponse.json({
    symbol,
    bestBid,
    bestAsk,
    mid: bestBid !== null && bestAsk !== null ? (bestBid + bestAsk) / 2 : null,
    spread: bestBid !== null && bestAsk !== null ? +(bestAsk - bestBid).toFixed(4) : null,
    bidDepth,
    askDepth,
    imbalance: bidDepth + askDepth > 0 ? +((bidDepth - askDepth) / (bidDepth + askDepth)).toFixed(4) : null,
  });
};

export const GET = withX402(
  handler,
  paidRoute("/api/paid/analysis", "Order-book analysis for a Gemini prediction contract"),
  x402Server,
);
