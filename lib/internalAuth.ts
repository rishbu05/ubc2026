// Shared-secret auth for server-only agent routes (enforced in proxy.ts).
// Callers send:  x-agent-secret: <AGENT_INTERNAL_SECRET>
// Never expose AGENT_INTERNAL_SECRET to the browser (no NEXT_PUBLIC_ prefix, no client components).

export const INTERNAL_SECRET_HEADER = "x-agent-secret";

/** Paths that require the shared secret. Kept in one place so proxy.ts and docs agree. */
export function requiresInternalSecret(pathname: string, method: string): boolean {
  if (pathname === "/api/agent" || pathname.startsWith("/api/agent/")) return true;
  if (pathname === "/api/approve" && method === "POST") return true; // creating approvals
  return false;
}

/** Constant-time string compare (runtime-agnostic: no node:crypto needed). */
export function safeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  const len = Math.max(x.length, y.length);
  for (let i = 0; i < len; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

/** Headers for server-side code (scripts, other services) calling protected agent routes. */
export function internalHeaders(): Record<string, string> {
  const secret = process.env.AGENT_INTERNAL_SECRET;
  if (!secret) throw new Error("Missing env var AGENT_INTERNAL_SECRET");
  return { [INTERNAL_SECRET_HEADER]: secret };
}
