// Spending policy for the agent's allowance. Pure: no I/O, so it is easy to test.
// Every purchase the agent wants to make is checked here before any money moves.

export type PolicyAction = "allow" | "block" | "require_approval";

export interface PolicyDecision {
  action: PolicyAction;
  reason: string;
}

export interface Policy {
  maxPerCallUsdc: number;
  dailyCapUsdc: number;
  /** Data purchases strictly above this need human approval. */
  approvalThresholdUsdc: number;
  /** URL paths the agent may pay for (our x402 endpoints in app/api/paid/*). */
  allowedEndpoints: string[];
  /** Origins (e.g. "https://allowance-chi-nine.vercel.app") those endpoints may live on. Empty = any. */
  allowedOrigins: string[];
}

export interface SpendRequest {
  amountUsdc: number;
  resourceUrl: string;
  /** USDC already spent in the current day window. */
  spentTodayUsdc: number;
  /** "data" = x402 paid endpoint; "trade" = prediction-market order. Default "data". */
  kind?: "data" | "trade";
}

/** Keep in sync with PAID_PRICES in lib/x402.ts. */
export const PAID_ENDPOINTS = ["/api/paid/odds-history", "/api/paid/news", "/api/paid/analysis"];

function num(name: string, fallback: number): number {
  const v = process.env[name];
  const n = v ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

function origins(...urls: (string | undefined)[]): string[] {
  const out = new Set<string>();
  for (const u of urls) {
    if (!u) continue;
    try {
      out.add(new URL(u).origin);
    } catch {
      /* ignore malformed env */
    }
  }
  return [...out];
}

export function defaultPolicy(): Policy {
  return {
    maxPerCallUsdc: num("POLICY_MAX_PER_TX_USDC", 0.1),
    dailyCapUsdc: num("POLICY_DAILY_LIMIT_USDC", 1),
    approvalThresholdUsdc: num("POLICY_APPROVAL_THRESHOLD_USDC", 0.05),
    allowedEndpoints: PAID_ENDPOINTS,
    allowedOrigins: origins(process.env.NEXT_PUBLIC_APP_URL, process.env.SOLANA_PAY_BASE_URL),
  };
}

/** Compare in micro-USDC so 0.7 + 0.3 doesn't read as over 1.0. */
const micro = (usdc: number) => Math.round(usdc * 1e6);

const block = (reason: string): PolicyDecision => ({ action: "block", reason });

export function evaluate(policy: Policy, req: SpendRequest): PolicyDecision {
  if (!(req.amountUsdc > 0)) return block("Amount must be positive");

  if (req.kind === "trade") {
    return { action: "require_approval", reason: `Trade of ${req.amountUsdc} USDC: all trades need human approval` };
  }

  let url: URL;
  try {
    url = new URL(req.resourceUrl);
  } catch {
    return block(`Invalid resource URL ${req.resourceUrl}`);
  }
  if (policy.allowedOrigins.length > 0 && !policy.allowedOrigins.includes(url.origin)) {
    return block(`Origin ${url.origin} is not on the allowlist`);
  }
  const path = url.pathname.replace(/\/+$/, "");
  if (!policy.allowedEndpoints.includes(path)) {
    return block(`Endpoint ${path} is not on the allowlist`);
  }

  if (micro(req.amountUsdc) > micro(policy.maxPerCallUsdc)) {
    return block(`Amount ${req.amountUsdc} exceeds per-call max ${policy.maxPerCallUsdc}`);
  }
  if (micro(req.spentTodayUsdc) + micro(req.amountUsdc) > micro(policy.dailyCapUsdc)) {
    return block(
      `Would exceed daily cap ${policy.dailyCapUsdc} (spent ${req.spentTodayUsdc}, asking ${req.amountUsdc})`,
    );
  }
  if (micro(req.amountUsdc) > micro(policy.approvalThresholdUsdc)) {
    return {
      action: "require_approval",
      reason: `Amount ${req.amountUsdc} is above approval threshold ${policy.approvalThresholdUsdc}`,
    };
  }
  return { action: "allow", reason: `Within policy (${req.amountUsdc} USDC)` };
}
