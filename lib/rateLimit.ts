// Global rate limit for agent runs (both /api/agent/run and the /agent page). Server-only.
// Backed by Supabase `agent_runs` (supabase/migrations/0003_agent_runs.sql) so it holds across
// serverless instances. If the table is missing it fails OPEN to a per-instance in-memory limit
// (same 30s interval and daily cap, but per server instance) so the demo keeps working.
import "server-only";
import { supabaseAdmin } from "./supabase";

function intEnv(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

export const RUN_INTERVAL_SECONDS = intEnv("AGENT_RUN_INTERVAL_SECONDS", 30);
export const RUNS_PER_DAY = intEnv("AGENT_RUNS_PER_DAY", 30);

export type AcquireResult =
  | { ok: true; runId: number }
  | { ok: false; reason: string; retryAfterSeconds: number };

function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

const MISSING_TABLE = new Set(["PGRST205", "42P01"]);

// In-memory fallback (per instance) used only when agent_runs is unavailable.
const mem = { lastStartMs: 0, day: "", count: 0 };
function acquireInMemory(now: Date): AcquireResult {
  const day = now.toISOString().slice(0, 10);
  if (mem.day !== day) Object.assign(mem, { day, count: 0 });
  const sinceS = (now.getTime() - mem.lastStartMs) / 1000;
  if (sinceS < RUN_INTERVAL_SECONDS) {
    const wait = Math.ceil(RUN_INTERVAL_SECONDS - sinceS);
    return { ok: false, reason: `Rate limited: 1 agent run per ${RUN_INTERVAL_SECONDS}s. Try again in ${wait}s.`, retryAfterSeconds: wait };
  }
  if (mem.count >= RUNS_PER_DAY) {
    const wait = Math.ceil((startOfUtcDay(now).getTime() + 86_400_000 - now.getTime()) / 1000);
    return { ok: false, reason: `Daily limit reached: ${RUNS_PER_DAY} agent runs per day (resets 00:00 UTC).`, retryAfterSeconds: wait };
  }
  mem.lastStartMs = now.getTime();
  mem.count++;
  console.warn("rateLimit: agent_runs table unavailable, using in-memory per-instance limit");
  return { ok: true, runId: -1 }; // -1 = not persisted
}

export async function acquireAgentRun(source: "api" | "page", task: string): Promise<AcquireResult> {
  const db = supabaseAdmin();
  const now = new Date();

  // 1) Sliding interval: no run may start within RUN_INTERVAL_SECONDS of the previous one.
  const { data: last, error: lastErr } = await db
    .from("agent_runs")
    .select("started_at")
    .order("started_at", { ascending: false })
    .limit(1);
  if (lastErr) {
    if (MISSING_TABLE.has(lastErr.code)) return acquireInMemory(now);
    throw new Error(`rate limit check failed: ${lastErr.message}`);
  }
  if (last?.[0]) {
    const sinceS = (now.getTime() - new Date(last[0].started_at).getTime()) / 1000;
    if (sinceS < RUN_INTERVAL_SECONDS) {
      const wait = Math.ceil(RUN_INTERVAL_SECONDS - sinceS);
      return { ok: false, reason: `Rate limited: 1 agent run per ${RUN_INTERVAL_SECONDS}s. Try again in ${wait}s.`, retryAfterSeconds: wait };
    }
  }

  // 2) Daily cap (UTC day).
  const dayStart = startOfUtcDay(now);
  const { count, error: countErr } = await db
    .from("agent_runs")
    .select("id", { count: "exact", head: true })
    .gte("started_at", dayStart.toISOString());
  if (countErr) throw new Error(`rate limit count failed: ${countErr.message}`);
  if ((count ?? 0) >= RUNS_PER_DAY) {
    const wait = Math.ceil((dayStart.getTime() + 86_400_000 - now.getTime()) / 1000);
    return { ok: false, reason: `Daily limit reached: ${RUNS_PER_DAY} agent runs per day (resets 00:00 UTC).`, retryAfterSeconds: wait };
  }

  // 3) Atomic claim: unique 30s slot, so concurrent requests can't both start.
  const slotSeconds = RUN_INTERVAL_SECONDS;
  const slot = Math.floor(now.getTime() / 1000 / slotSeconds);
  const { data: row, error: insErr } = await db
    .from("agent_runs")
    .insert({ slot, source, task: task.slice(0, 1000) })
    .select("id")
    .single<{ id: number }>();
  if (insErr) {
    if (insErr.code === "23505") {
      const wait = Math.max(1, (slot + 1) * slotSeconds - Math.floor(now.getTime() / 1000));
      return { ok: false, reason: `Rate limited: another agent run just started. Try again in ${wait}s.`, retryAfterSeconds: wait };
    }
    if (MISSING_TABLE.has(insErr.code)) return acquireInMemory(now);
    throw new Error(`rate limit claim failed: ${insErr.message}`);
  }
  return { ok: true, runId: row.id };
}

export async function finishAgentRun(runId: number, status: "succeeded" | "failed", error?: string) {
  if (runId < 0) return; // in-memory fallback run, nothing persisted
  await supabaseAdmin()
    .from("agent_runs")
    .update({ status, finished_at: new Date().toISOString(), error: error?.slice(0, 1000) ?? null })
    .eq("id", runId)
    .then(({ error: e }) => e && console.error("finishAgentRun:", e.message));
}
