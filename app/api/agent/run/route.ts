// POST /api/agent/run { task, event_ticker?, approver? }  (requires x-agent-secret, see proxy.ts)
// Runs the Claude agent loop (lib/agent.ts): buys data via policyFetch, may propose one sandbox trade
// that waits for human approval. Returns the step log, final answer and any pending proposal.
import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { runAgent } from "@/lib/agent";

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
    return NextResponse.json(await runAgent({ task, eventTicker: body.event_ticker, approver: body.approver }));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
