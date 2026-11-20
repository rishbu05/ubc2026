// policyFetch wiring with fakes for agentFetch / Supabase / approvals (no network, no Circle).
import { test } from "node:test";
import assert from "node:assert/strict";
import { policyFetch, type PolicyFetchDeps } from "./policyFetch";
import { PAID_ENDPOINTS, type Policy } from "./policy";

const APP = "https://allowance-chi-nine.vercel.app";
const policy: Policy = {
  maxPerCallUsdc: 0.1,
  dailyCapUsdc: 1,
  approvalThresholdUsdc: 0.05,
  allowedEndpoints: PAID_ENDPOINTS,
  allowedOrigins: [APP],
};

/** Fake agentFetch: the endpoint charges `price`; pays only if beforePay says yes. */
function setup(price: number, spentToday = 0) {
  const ledger: Parameters<PolicyFetchDeps["recordSpend"]>[0][] = [];
  const approvals: Parameters<PolicyFetchDeps["createApproval"]>[0][] = [];
  let paid = false;
  const deps: Partial<PolicyFetchDeps> = {
    policy: () => policy,
    getSpentToday: async () => spentToday,
    recordSpend: async (row) => {
      ledger.push(row);
      return {} as never;
    },
    createApproval: async (input) => {
      approvals.push(input);
      return { approval: { id: 42 } as never, url: "solana:https://example/api/approve/42" };
    },
    agentFetch: async (input, _init, opts) => {
      const url = input.toString();
      const ok = await opts!.beforePay!({ amountUsdc: price, payTo: "seller", resourceUrl: url, requirements: {} as never });
      if (!ok) return { response: new Response(null, { status: 402 }) };
      paid = true;
      return {
        response: new Response("data"),
        payment: { txSignature: "sig123", explorerUrl: "x", amountUsdc: price, payTo: "seller", network: "solana" },
      };
    },
  };
  return { deps, ledger, approvals, wasPaid: () => paid };
}

test("allow: pays and records a paid ledger row", async () => {
  const t = setup(0.02);
  const r = await policyFetch(`${APP}/api/paid/news?event=FED261211`, {}, t.deps);
  assert.equal(r.decision?.action, "allow");
  assert.equal(r.response.status, 200);
  assert.equal(r.payment?.txSignature, "sig123");
  assert.ok(t.wasPaid());
  assert.deepEqual(t.ledger.map((l) => [l.status, l.amountUsdc, l.txSignature]), [["paid", 0.02, "sig123"]]);
  assert.equal(t.approvals.length, 0);
});

test("block: does not pay, records blocked", async () => {
  const t = setup(0.02, 0.99);
  const r = await policyFetch(`${APP}/api/paid/news`, {}, t.deps);
  assert.equal(r.decision?.action, "block");
  assert.equal(r.response.status, 402);
  assert.equal(r.payment, undefined);
  assert.ok(!t.wasPaid());
  assert.deepEqual(t.ledger.map((l) => l.status), ["blocked"]);
});

test("require_approval: creates approval, does not pay, records pending_approval", async () => {
  const t = setup(0.08);
  const r = await policyFetch(`${APP}/api/paid/analysis?event=FED261211`, {}, t.deps);
  assert.equal(r.decision?.action, "require_approval");
  assert.ok(!t.wasPaid());
  assert.deepEqual(r.approval, { id: 42, url: "solana:https://example/api/approve/42" });
  assert.equal(t.approvals[0].amountUsdc, 0.08);
  assert.equal(t.approvals[0].description, "pay 0.08 USDC for /api/paid/analysis");
  assert.deepEqual(t.ledger.map((l) => l.status), ["pending_approval"]);
  assert.match(t.ledger[0].reason!, /approval #42/);
});

test("settlement failure after allow is recorded as failed and rethrown", async () => {
  const t = setup(0.02);
  const realFetch = t.deps.agentFetch!;
  t.deps.agentFetch = async (input, init, opts) => {
    await realFetch(input, init, opts);
    throw new Error("x402 payment was rejected: boom");
  };
  await assert.rejects(policyFetch(`${APP}/api/paid/news`, {}, t.deps), /boom/);
  assert.deepEqual(t.ledger.map((l) => l.status), ["failed"]);
});
