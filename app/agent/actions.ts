"use server";
// Server actions for the /agent page. The browser never sees AGENT_INTERNAL_SECRET; these run the
// same libs as /api/agent/* on the server. Spend is bounded by the policy's daily cap.
import { PublicKey } from "@solana/web3.js";
import { runAgent, type AgentRunResult } from "@/lib/agent";
import { executeApprovedTrade, type ExecutionResult, type TradeOrder } from "@/lib/trade";
import { getSpentToday } from "@/lib/ledger";
import { recentLedger, type LedgerRow } from "./data";

export async function runAgentAction(input: {
  task: string;
  approver?: string;
}): Promise<{ ok: true; result: AgentRunResult } | { ok: false; error: string }> {
  const task = input.task.trim().slice(0, 1000);
  if (!task) return { ok: false, error: "Task is required" };
  if (input.approver) {
    try {
      new PublicKey(input.approver);
    } catch {
      return { ok: false, error: "Invalid approver address" };
    }
  }
  try {
    return { ok: true, result: await runAgent({ task, approver: input.approver }) };
  } catch (e) {
    // Server action errors are masked in production; return the message explicitly.
    return { ok: false, error: (e as Error).message };
  }
}

export async function executeTradeAction(
  approvalId: number,
  order: TradeOrder,
): Promise<{ ok: true; result: ExecutionResult } | { ok: false; error: string }> {
  try {
    return { ok: true, result: await executeApprovedTrade(approvalId, order) };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function refreshLedgerAction(): Promise<{ ledger: LedgerRow[]; spentTodayUsdc: number }> {
  const [ledger, spentTodayUsdc] = await Promise.all([recentLedger(), getSpentToday()]);
  return { ledger, spentTodayUsdc };
}
