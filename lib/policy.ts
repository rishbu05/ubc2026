// Spending policy for the agent's allowance.
// Every purchase the agent wants to make is checked here before any money moves.

export type PolicyDecision =
  | { action: "allow" }
  | { action: "require_approval"; reason: string }
  | { action: "deny"; reason: string };

export interface Policy {
  maxPerTxUsdc: number;
  dailyLimitUsdc: number;
  approvalThresholdUsdc: number;
  /** Optional allowlist of hostnames the agent may pay. Empty = any. */
  allowedHosts: string[];
}

export interface SpendRequest {
  amountUsdc: number;
  resourceUrl: string;
  /** USDC already spent in the current day window. */
  spentTodayUsdc: number;
}

function num(name: string, fallback: number): number {
  const v = process.env[name];
  const n = v ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

export function defaultPolicy(): Policy {
  return {
    maxPerTxUsdc: num("POLICY_MAX_PER_TX_USDC", 0.1),
    dailyLimitUsdc: num("POLICY_DAILY_LIMIT_USDC", 1),
    approvalThresholdUsdc: num("POLICY_APPROVAL_THRESHOLD_USDC", 0.05),
    allowedHosts: [],
  };
}

export function evaluate(policy: Policy, req: SpendRequest): PolicyDecision {
  if (!(req.amountUsdc > 0)) {
    return { action: "deny", reason: "Amount must be positive" };
  }
  if (policy.allowedHosts.length > 0) {
    const host = new URL(req.resourceUrl).hostname;
    if (!policy.allowedHosts.includes(host)) {
      return { action: "deny", reason: `Host ${host} is not on the allowlist` };
    }
  }
  if (req.amountUsdc > policy.maxPerTxUsdc) {
    return {
      action: "deny",
      reason: `Amount ${req.amountUsdc} exceeds per-transaction max ${policy.maxPerTxUsdc}`,
    };
  }
  if (req.spentTodayUsdc + req.amountUsdc > policy.dailyLimitUsdc) {
    return {
      action: "deny",
      reason: `Would exceed daily limit ${policy.dailyLimitUsdc}`,
    };
  }
  if (req.amountUsdc > policy.approvalThresholdUsdc) {
    return {
      action: "require_approval",
      reason: `Amount ${req.amountUsdc} is above approval threshold ${policy.approvalThresholdUsdc}`,
    };
  }
  return { action: "allow" };
}
