// policyFetch: agentFetch with the spending policy plugged into beforePay. Server-only.
//
// On a 402: evaluate(defaultPolicy(), { amount, url, spentToday }) ->
//   allow:            pay, then record a `paid` ledger row with the settlement signature.
//   require_approval: create a Solana Pay approval (lib/approvals.ts), record `pending_approval`, don't pay.
//   block:            record `blocked`, don't pay.
// When not paid, the original 402 response is returned.
import "server-only";
import { agentFetch, type AgentFetchResult } from "./agentPay";
import { createApproval } from "./approvals";
import { getSpentToday, recordSpend } from "./ledger";
import { defaultPolicy, evaluate, type Policy, type PolicyDecision } from "./policy";

export interface PolicyFetchResult extends AgentFetchResult {
  /** Policy decision; absent when the endpoint didn't ask for payment. */
  decision?: PolicyDecision;
  /** Set when the decision was require_approval: the Solana Pay link for the human. */
  approval?: { id: number; url: string };
}

export interface PolicyFetchDeps {
  agentFetch: typeof agentFetch;
  createApproval: typeof createApproval;
  getSpentToday: typeof getSpentToday;
  recordSpend: typeof recordSpend;
  policy: () => Policy;
}

const defaultDeps: PolicyFetchDeps = { agentFetch, createApproval, getSpentToday, recordSpend, policy: defaultPolicy };

export async function policyFetch(
  input: string | URL,
  init: RequestInit = {},
  overrides: Partial<PolicyFetchDeps> = {},
): Promise<PolicyFetchResult> {
  const deps = { ...defaultDeps, ...overrides };
  let decision: PolicyDecision | undefined;
  let approval: PolicyFetchResult["approval"];
  let quoted: { amountUsdc: number; resourceUrl: string } | undefined;

  let result: AgentFetchResult;
  try {
    result = await deps.agentFetch(input, init, {
      beforePay: async ({ amountUsdc, resourceUrl }) => {
        quoted = { amountUsdc, resourceUrl };
        const d = evaluate(deps.policy(), { amountUsdc, resourceUrl, spentTodayUsdc: await deps.getSpentToday() });
        decision = d;
        if (d.action === "allow") return true;
        if (d.action === "require_approval") {
          const path = new URL(resourceUrl).pathname;
          const created = await deps.createApproval({
            description: `pay ${amountUsdc} USDC for ${path}`,
            amountUsdc,
            resourceUrl,
          });
          approval = { id: created.approval.id, url: created.url };
        }
        await deps.recordSpend({
          amountUsdc,
          resourceUrl,
          status: d.action === "block" ? "blocked" : "pending_approval",
          reason: approval ? `${d.reason} (approval #${approval.id})` : d.reason,
        });
        return false;
      },
    });
  } catch (e) {
    // Payment was allowed but failed to settle: nothing moved, record it (not counted toward the cap).
    if (decision?.action === "allow" && quoted) {
      await deps
        .recordSpend({ ...quoted, status: "failed", reason: e instanceof Error ? e.message : String(e) })
        .catch((err) => console.error("policyFetch: could not record failed spend", err));
    }
    throw e;
  }

  const { payment } = result;
  if (payment) {
    // Money has moved; don't lose the paid response if the ledger write fails, but say so loudly.
    await deps
      .recordSpend({
        amountUsdc: payment.amountUsdc,
        resourceUrl: quoted?.resourceUrl ?? input.toString(),
        status: "paid",
        reason: decision?.reason,
        txSignature: payment.txSignature,
      })
      .catch((err) => console.error(`policyFetch: PAID ${payment.txSignature} but ledger write failed`, err));
  }
  return { ...result, decision, approval };
}
