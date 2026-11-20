// Spending policy for the agent's allowance. Pure (no I/O) so it is easy to test.
// Every spend the agent wants to make is checked here before any money moves.
//
// Two kinds of spend:
//   - "data":  x402 paid API calls (lib/agentPay.ts). Capped per call.
//   - "trade": prediction-market orders (lib/gemini.ts placeOrder). Not capped per call
//              (a trade is bigger than a data call), but by default ALWAYS needs human approval.
// Both count toward the daily limit.

export type SpendKind = "data" | "trade";

export type PolicyDecision =
  | { action: "allow" }
  | { action: "require_approval"; reason: string }
  | { action: "deny"; reason: string };

export interface Policy {
  /** Max USDC for a single x402 data call (kind "data"). */
  maxPerCallUsdc: number;
  /** Max total USDC across all spends in the current day window. */
  dailyLimitUsdc: number;
  /** Spends above this need human approval (Solana Pay, app/api/approve/*). */
  approvalThresholdUsdc: number;
  /** When true, every trade needs human approval regardless of size. */
  tradesRequireApproval: boolean;
  /** Optional allowlist of hostnames the agent may pay for data. Empty = any. */
  allowedHosts: string[];
}

export interface SpendRequest {
  amountUsdc: number;
  /** Defaults to "data" (backward compatible with x402-only callers). */
  kind?: SpendKind;
  /** Required for "data" spends (used for the host allowlist). */
  resourceUrl?: string;
  /** USDC already spent in the current day window. */
  spentTodayUsdc: number;
}

function num(name: string, fallback: number): number {
  const v = process.env[name];
  const n = v ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

function bool(name: string, fallback: boolean): boolean {
  const v = process.env[name]?.trim().toLowerCase();
  if (v === undefined || v === "") return fallback;
  return v === "true" || v === "1" || v === "yes";
}

export function defaultPolicy(): Policy {
  return {
    maxPerCallUsdc: num("POLICY_MAX_PER_TX_USDC", 0.1),
    dailyLimitUsdc: num("POLICY_DAILY_LIMIT_USDC", 5),
    approvalThresholdUsdc: num("POLICY_APPROVAL_THRESHOLD_USDC", 2),
    tradesRequireApproval: bool("POLICY_TRADES_REQUIRE_APPROVAL", true),
    allowedHosts: [],
  };
}

export function evaluate(policy: Policy, req: SpendRequest): PolicyDecision {
  const kind = req.kind ?? "data";
  const amt = req.amountUsdc;

  if (!(amt > 0)) return { action: "deny", reason: "Amount must be positive" };

  if (kind === "data") {
    if (policy.allowedHosts.length > 0) {
      if (!req.resourceUrl) return { action: "deny", reason: "resourceUrl required for data spends" };
      const host = new URL(req.resourceUrl).hostname;
      if (!policy.allowedHosts.includes(host)) {
        return { action: "deny", reason: `Host ${host} is not on the allowlist` };
      }
    }
    if (amt > policy.maxPerCallUsdc) {
      return { action: "deny", reason: `Data call ${amt} USDC exceeds per-call max ${policy.maxPerCallUsdc}` };
    }
  }

  if (req.spentTodayUsdc + amt > policy.dailyLimitUsdc) {
    return {
      action: "deny",
      reason: `Would exceed daily limit ${policy.dailyLimitUsdc} USDC (spent ${req.spentTodayUsdc}, requested ${amt})`,
    };
  }

  if (kind === "trade" && policy.tradesRequireApproval) {
    return { action: "require_approval", reason: "All trades require human approval" };
  }
  if (amt > policy.approvalThresholdUsdc) {
    return {
      action: "require_approval",
      reason: `${amt} USDC is above the approval threshold ${policy.approvalThresholdUsdc}`,
    };
  }
  return { action: "allow" };
}
