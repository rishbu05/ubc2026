// POST /api/agent/run { task, event_ticker?, approver? }  (requires x-agent-secret, see proxy.ts)
// Runs the Claude agent loop (lib/agent.ts): buys data via policyFetch, may propose one sandbox trade
// that waits for human approval. Returns the step log, final answer and any pending proposal.
// Rate limited (shared with the /agent page): 1 run per 30s, 30 per UTC day -> 429 + Retry-After.
import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { runAgentRateLimited } from "@/lib/agent";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { task?: string; event_ticker?: string; approver?: string };
  const task = body.task?.trim();
  if (!task) return NextResponse.json({ error: "task is required" }, { status: 400 });
  if (task.length > 1000) return NextResponse.json({ error: "task must be at most 1000 characters" }, { status: 400 });
  if (body.approver) {
    try {
      new PublicKey(body.approver);
    } catch {
      return NextResponse.json({ error: "approver must be a Solana address" }, { status: 400 });
    }
  }
  try {
    const r = await runAgentRateLimited("api", { task, eventTicker: body.event_ticker, approver: body.approver });
    if (!r.ok) {
      return NextResponse.json(
        { error: r.reason, retryAfterSeconds: r.retryAfterSeconds },
        { status: 429, headers: { "Retry-After": String(r.retryAfterSeconds) } },
      );
    }
    return NextResponse.json(r.result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
