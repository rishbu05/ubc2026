import { test } from "node:test";
import assert from "node:assert/strict";
import { PAID_ENDPOINTS, evaluate, type Policy } from "./policy";

const APP = "https://allowance-chi-nine.vercel.app";
const policy: Policy = {
  maxPerCallUsdc: 0.1,
  dailyCapUsdc: 1,
  approvalThresholdUsdc: 0.05,
  allowedEndpoints: PAID_ENDPOINTS,
  allowedOrigins: [APP],
};

test("allowed call", () => {
  const d = evaluate(policy, { amountUsdc: 0.02, resourceUrl: `${APP}/api/paid/news?event=FED261211`, spentTodayUsdc: 0 });
  assert.equal(d.action, "allow");
});

test("amount equal to threshold is allowed", () => {
  const d = evaluate(policy, { amountUsdc: 0.05, resourceUrl: `${APP}/api/paid/analysis`, spentTodayUsdc: 0 });
  assert.equal(d.action, "allow");
});

test("non-allowlisted endpoint is blocked", () => {
  const d = evaluate(policy, { amountUsdc: 0.01, resourceUrl: `${APP}/api/paid/secret`, spentTodayUsdc: 0 });
  assert.equal(d.action, "block");
  assert.match(d.reason, /allowlist/);
});

test("allowlisted path on a foreign origin is blocked", () => {
  const d = evaluate(policy, { amountUsdc: 0.01, resourceUrl: "https://evil.example/api/paid/news", spentTodayUsdc: 0 });
  assert.equal(d.action, "block");
  assert.match(d.reason, /Origin/);
});

test("over per-call max is blocked", () => {
  const d = evaluate(policy, { amountUsdc: 0.11, resourceUrl: `${APP}/api/paid/analysis`, spentTodayUsdc: 0 });
  assert.equal(d.action, "block");
  assert.match(d.reason, /per-call max/);
});

test("daily cap hit is blocked", () => {
  const d = evaluate(policy, { amountUsdc: 0.02, resourceUrl: `${APP}/api/paid/news`, spentTodayUsdc: 0.99 });
  assert.equal(d.action, "block");
  assert.match(d.reason, /daily cap/);
});

test("landing exactly on the daily cap is allowed (no float drift)", () => {
  const d = evaluate(policy, { amountUsdc: 0.03, resourceUrl: `${APP}/api/paid/news`, spentTodayUsdc: 0.97 });
  assert.equal(d.action, "allow");
});

test("over threshold requires approval", () => {
  const d = evaluate(policy, { amountUsdc: 0.08, resourceUrl: `${APP}/api/paid/analysis`, spentTodayUsdc: 0 });
  assert.equal(d.action, "require_approval");
  assert.match(d.reason, /threshold/);
});

test("any trade requires approval, even tiny ones", () => {
  for (const amountUsdc of [0.01, 5, 500]) {
    const d = evaluate(policy, { amountUsdc, resourceUrl: "gemini:FED261211", spentTodayUsdc: 0, kind: "trade" });
    assert.equal(d.action, "require_approval");
    assert.match(d.reason, /trade/i);
  }
});

test("non-positive amount is blocked", () => {
  const d = evaluate(policy, { amountUsdc: 0, resourceUrl: `${APP}/api/paid/news`, spentTodayUsdc: 0 });
  assert.equal(d.action, "block");
});

test("tradesRequireApproval=false: small trade allowed, large trade needs approval", () => {
  const p: Policy = { ...policy, approvalThresholdUsdc: 2, tradesRequireApproval: false };
  assert.equal(evaluate(p, { amountUsdc: 0.5, resourceUrl: "gemini:BTC2611302200", spentTodayUsdc: 0, kind: "trade" }).action, "allow");
  assert.equal(evaluate(p, { amountUsdc: 3, resourceUrl: "gemini:BTC2611302200", spentTodayUsdc: 0, kind: "trade" }).action, "require_approval");
});

test("per-call max and endpoint allowlist apply to data only, not trades", () => {
  const d = evaluate(policy, { amountUsdc: 0.5, resourceUrl: "gemini:BTC2611302200", spentTodayUsdc: 0, kind: "trade" });
  assert.equal(d.action, "require_approval"); // 0.5 > maxPerCallUsdc 0.1 and not an allowlisted URL, still not blocked
});
