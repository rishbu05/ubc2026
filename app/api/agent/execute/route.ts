// POST /api/agent/execute { approvalId, order }  (requires x-agent-secret, see proxy.ts)
// Places the REAL Gemini sandbox order for an approval that was signed onchain (paper fallback if the
// sandbox order fails). The order must match the approved description exactly.
import { NextRequest, NextResponse } from "next/server";
import { executeApprovedTrade, type TradeOrder } from "@/lib/trade";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { approvalId?: number; order?: TradeOrder };
  const id = Number(body.approvalId);
  if (!Number.isInteger(id) || !body.order) {
    return NextResponse.json({ error: "approvalId and order are required" }, { status: 400 });
  }
  try {
    const result = await executeApprovedTrade(id, body.order);
    return NextResponse.json(result, { status: result.mode === "not_executed" ? 409 : 200 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
