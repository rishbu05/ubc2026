// Trade proposals and execution. Server-only.
//
// propose: validate against SANDBOX contract specs -> policy (kind "trade") -> Solana Pay approval
//          (memo "approve #id: <description>") + ledger row `pending_approval`.
// execute: approval verified onchain (lib/approvals checkApproval) AND the order re-derives the exact
//          approved description -> REAL Gemini SANDBOX limit order (placeOrder). If the sandbox order
//          fails, a clearly labeled PAPER trade is recorded instead.
//
// Ledger semantics (spend_ledger.status is paid|blocked|pending_approval|failed):
//   sandbox orders spend Gemini play money, not the agent's USDC, so executed trades are recorded as
//   `paid` with amount_usdc = 0 (they must not eat the daily data budget). tx_signature = the approval's
//   onchain signature (unique -> one execution per approval).
import "server-only";
import { checkApproval, createApproval, getApproval } from "./approvals";
import { getEvent, placeOrder, GEMINI_BASE_URL } from "./gemini";
import { recordSpend, getSpentToday } from "./ledger";
import { defaultPolicy, evaluate } from "./policy";
import { supabaseAdmin } from "./supabase";

export interface TradeOrder {
  symbol: string;
  side: "buy" | "sell";
  outcome: "yes" | "no";
  quantity: string;
  limitPrice: string;
}

/** Hard ceiling for the demo regardless of policy: notional per trade (sandbox USD). */
export const MAX_TRADE_NOTIONAL = 25;

const resourceFor = (approvalId: number) => `gemini-sandbox:approval/${approvalId}`;

function decimals(step: string): number {
  return step.includes(".") ? step.split(".")[1].length : 0;
}

/** Deterministic human text; the approval memo and execution both depend on it matching exactly. */
export function describeTrade(o: TradeOrder): string {
  const notional = (Number(o.quantity) * Number(o.limitPrice)).toFixed(2);
  return `${o.side === "buy" ? "Buy" : "Sell"} ${o.quantity} ${o.outcome.toUpperCase()} ${o.symbol} @ ${o.limitPrice} (~$${notional}, Gemini sandbox)`;
}

/** Validate an order against the live SANDBOX contract specs. Returns normalized order or error. */
export async function validateOrder(o: TradeOrder): Promise<{ order: TradeOrder; notional: number } | { error: string }> {
  const eventTicker = o.symbol.split("-")[1];
  if (!o.symbol.startsWith("GEMI-") || !eventTicker) return { error: `Invalid symbol ${o.symbol}` };
  let ev;
  try {
    ev = await getEvent(eventTicker, { venue: "sandbox" });
  } catch {
    return { error: `Event ${eventTicker} is not available on Gemini sandbox, so it can't be traded here` };
  }
  const c = ev.contracts.find((x) => x.instrumentSymbol === o.symbol);
  if (!c) return { error: `${o.symbol} is not listed on Gemini sandbox. Tradable: ${ev.contracts.map((x) => x.instrumentSymbol).join(", ")}` };
  if (c.marketState && c.marketState !== "open") return { error: `${o.symbol} market is ${c.marketState}` };

  const price = Number(o.limitPrice), qty = Number(o.quantity);
  const pStep = Number(c.priceIncrement ?? "0.01"), qStep = Number(c.quantityIncrement ?? "1");
  const pMin = Number(c.priceMinimum ?? pStep), qMin = Number(c.quantityMinimum ?? qStep);
  if (!(price >= pMin && price < 1)) return { error: `limit_price must be between ${pMin} and 0.99` };
  if (!(qty >= qMin)) return { error: `quantity must be at least ${qMin}` };
  const onStep = (v: number, step: number) => Math.abs(Math.round(v / step) * step - v) < 1e-9;
  if (!onStep(price, pStep)) return { error: `limit_price must be a multiple of ${c.priceIncrement}` };
  if (!onStep(qty, qStep)) return { error: `quantity must be a multiple of ${c.quantityIncrement}` };

  const order: TradeOrder = {
    ...o,
    limitPrice: price.toFixed(decimals(c.priceIncrement ?? "0.01")),
    quantity: qty.toFixed(decimals(c.quantityIncrement ?? "1")),
  };
  const notional = Number(order.quantity) * Number(order.limitPrice);
  if (notional > MAX_TRADE_NOTIONAL) return { error: `Notional $${notional.toFixed(2)} exceeds the demo max of $${MAX_TRADE_NOTIONAL}` };
  return { order, notional };
}

export type ProposalResult =
  | { status: "pending_approval"; approvalId: number; approvalUrl: string; order: TradeOrder; description: string; notional: number; reason: string }
  | { status: "allowed_without_approval"; order: TradeOrder; description: string; notional: number; reason: string }
  | { status: "blocked" | "invalid"; reason: string };

export async function proposeTrade(o: TradeOrder, opts: { approver?: string } = {}): Promise<ProposalResult> {
  const v = await validateOrder(o);
  if ("error" in v) return { status: "invalid", reason: v.error };
  const { order, notional } = v;
  const description = describeTrade(order);

  const decision = evaluate(defaultPolicy(), {
    amountUsdc: notional,
    resourceUrl: `gemini-sandbox:${order.symbol}`,
    spentTodayUsdc: await getSpentToday(),
    kind: "trade",
  });
  if (decision.action === "block") return { status: "blocked", reason: decision.reason };
  if (decision.action === "allow") {
    // Only possible if POLICY_TRADES_REQUIRE_APPROVAL=false; the demo always routes through a human.
    return { status: "allowed_without_approval", order, description, notional, reason: decision.reason };
  }

  const { approval, url } = await createApproval({ description, amountUsdc: notional, approver: opts.approver });
  await recordSpend({
    amountUsdc: notional,
    resourceUrl: resourceFor(approval.id),
    status: "pending_approval",
    reason: `[trade] ${description} (approval #${approval.id})`,
  });
  return { status: "pending_approval", approvalId: approval.id, approvalUrl: url, order, description, notional, reason: decision.reason };
}

export type ExecutionResult =
  | { mode: "sandbox"; orderId: string; status: string; order: TradeOrder; approvalSignature: string; alreadyExecuted?: boolean }
  | { mode: "paper"; reason: string; order: TradeOrder; approvalSignature: string }
  | { mode: "not_executed"; reason: string };

/** Execute an approved trade. `order` must re-derive the exact approved description. */
export async function executeApprovedTrade(approvalId: number, o: TradeOrder): Promise<ExecutionResult> {
  const approval = await getApproval(approvalId);
  if (!approval) return { mode: "not_executed", reason: `Approval #${approvalId} not found` };
  if (approval.description !== describeTrade(o)) {
    return { mode: "not_executed", reason: "Order does not match what was approved" };
  }

  // Already executed? (one execution per approval)
  const { data: prior } = await supabaseAdmin()
    .from("spend_ledger")
    .select("reason,tx_signature,status")
    .eq("resource_url", resourceFor(approvalId))
    .in("status", ["paid", "failed"])
    .limit(1);
  if (prior?.[0]) {
    const m = prior[0].reason?.match(/sandbox order (\d+)/);
    if (prior[0].status === "paid" && m) {
      return { mode: "sandbox", orderId: m[1], status: "submitted", order: o, approvalSignature: prior[0].tx_signature ?? "", alreadyExecuted: true };
    }
    return { mode: "paper", reason: prior[0].reason ?? "previously recorded as paper trade", order: o, approvalSignature: prior[0].tx_signature ?? "" };
  }

  const check = await checkApproval(approvalId);
  if (check.status !== "approved") {
    return { mode: "not_executed", reason: check.status === "pending" ? "Not approved onchain yet" : check.reason };
  }

  if (!GEMINI_BASE_URL.includes("sandbox")) {
    return { mode: "not_executed", reason: "Refusing to trade: GEMINI_API_BASE_URL is not the sandbox" };
  }

  try {
    const res = (await placeOrder(o.symbol, o.side, o.quantity, o.limitPrice, {
      outcome: o.outcome,
      timeInForce: "good-til-cancel",
    })) as { orderId?: string; status?: string };
    if (!res.orderId) throw new Error(`No orderId in response: ${JSON.stringify(res).slice(0, 200)}`);
    await recordSpend({
      amountUsdc: 0,
      resourceUrl: resourceFor(approvalId),
      status: "paid",
      reason: `[trade] sandbox order ${res.orderId} (${res.status}): ${approval.description}`,
      txSignature: check.signature,
    });
    return { mode: "sandbox", orderId: String(res.orderId), status: res.status ?? "unknown", order: o, approvalSignature: check.signature };
  } catch (e) {
    const reason = `Sandbox order failed (${(e as Error).message}); recorded as PAPER trade`;
    await recordSpend({
      amountUsdc: 0,
      resourceUrl: resourceFor(approvalId),
      status: "failed",
      reason: `[trade] PAPER TRADE ${approval.description}. ${reason}`,
      txSignature: check.signature,
    }).catch(() => {});
    return { mode: "paper", reason, order: o, approvalSignature: check.signature };
  }
}
