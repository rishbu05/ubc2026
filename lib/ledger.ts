// Spend ledger (Supabase table spend_ledger). Server-only.
// Amounts are human USDC units. "Today" is the current UTC day.
import "server-only";
import { supabaseAdmin } from "./supabase";

export type SpendStatus = "paid" | "blocked" | "pending_approval" | "failed";

export interface SpendRow {
  id: number;
  ts: string;
  agent_id: string;
  amount_usdc: string;
  resource_url: string;
  reason: string | null;
  tx_signature: string | null;
  status: SpendStatus;
}

/** Agent identity for ledger rows. Defaults to the Circle wallet id. */
export function defaultAgentId(): string {
  return process.env.CIRCLE_AGENT_WALLET_ID || "agent";
}

function startOfUtcDay(now = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
}

/** USDC the agent has actually paid since UTC midnight. */
export async function getSpentToday(agentId = defaultAgentId()): Promise<number> {
  const { data, error } = await supabaseAdmin()
    .from("spend_ledger")
    .select("amount_usdc")
    .eq("agent_id", agentId)
    .eq("status", "paid")
    .gte("ts", startOfUtcDay());
  if (error) throw new Error(`getSpentToday: ${error.message}`);
  // numeric comes back as a string; sum in micro-USDC to avoid float drift.
  const micro = data.reduce((sum, r) => sum + Math.round(Number(r.amount_usdc) * 1e6), 0);
  return micro / 1e6;
}

export async function recordSpend(input: {
  amountUsdc: number;
  resourceUrl: string;
  status: SpendStatus;
  reason?: string;
  txSignature?: string;
  agentId?: string;
}): Promise<SpendRow> {
  const { data, error } = await supabaseAdmin()
    .from("spend_ledger")
    .insert({
      agent_id: input.agentId ?? defaultAgentId(),
      amount_usdc: input.amountUsdc,
      resource_url: input.resourceUrl,
      reason: input.reason ?? null,
      tx_signature: input.txSignature ?? null,
      status: input.status,
    })
    .select()
    .single<SpendRow>();
  if (error) throw new Error(`recordSpend: ${error.message}`);
  return data;
}
