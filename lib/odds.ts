// Reads odds history recorded by the partner's recorder into Supabase `odds_snapshots`
// (one row per contract per minute: ts, event_ticker, symbol, label, bid, ask, last, mid, raw).
// Source prices come from Gemini PRODUCTION public market data. Server-only.
import "server-only";
import { supabaseAdmin } from "./supabase";

export const DEFAULT_EVENT_TICKER = "FED261211";
export const DEFAULT_LIMIT = 500;
export const MAX_LIMIT = 5000;

export interface OddsQuery {
  symbol?: string;
  eventTicker?: string;
  /** ISO timestamp: only rows with ts >= since. */
  since?: string;
  limit?: number;
}

export interface OddsPoint {
  ts: string;
  bid: number | null;
  ask: number | null;
  last: number | null;
  mid: number | null;
}

export interface OddsSeries {
  symbol: string;
  label: string;
  eventTicker: string;
  points: OddsPoint[];
}

/** Recorder computes mid in floating point (0.045000000000000005); round for clean output. */
function px(v: number | null): number | null {
  return v === null || v === undefined ? null : Math.round(Number(v) * 1e6) / 1e6;
}

/** Parse + validate query params. Returns an error string for a 400, or the normalized query. */
export function parseOddsQuery(params: URLSearchParams): { error: string } | { query: Required<Pick<OddsQuery, "limit">> & OddsQuery } {
  const symbol = params.get("symbol")?.trim() || undefined;
  const eventTicker = params.get("event_ticker")?.trim() || params.get("event")?.trim() || undefined;
  if (symbol && eventTicker) return { error: "Pass either symbol or event_ticker, not both" };

  const sinceRaw = params.get("since")?.trim();
  let since: string | undefined;
  if (sinceRaw) {
    const d = new Date(sinceRaw);
    if (Number.isNaN(d.getTime())) return { error: `since must be an ISO timestamp, got "${sinceRaw}"` };
    since = d.toISOString();
  }

  const limitRaw = params.get("limit");
  let limit = DEFAULT_LIMIT;
  if (limitRaw !== null) {
    limit = Number(limitRaw);
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
      return { error: `limit must be an integer 1-${MAX_LIMIT}` };
    }
  }

  return {
    query: { symbol, eventTicker: symbol ? undefined : (eventTicker ?? DEFAULT_EVENT_TICKER), since, limit },
  };
}

/**
 * Rows ordered by ts ascending.
 * - with `since`: the first `limit` rows at or after `since`
 * - without `since`: the most recent `limit` rows (still returned oldest -> newest)
 */
export async function getOddsHistory(q: OddsQuery & { limit: number }) {
  let query = supabaseAdmin()
    .from("odds_snapshots")
    .select("ts,event_ticker,symbol,label,bid,ask,last,mid")
    .limit(q.limit);
  if (q.symbol) query = query.eq("symbol", q.symbol);
  else if (q.eventTicker) query = query.eq("event_ticker", q.eventTicker);
  if (q.since) query = query.gte("ts", q.since).order("ts", { ascending: true });
  else query = query.order("ts", { ascending: false });

  const { data, error } = await query;
  if (error) throw new Error(`odds_snapshots query failed: ${error.message}`);
  const rows = q.since ? data : [...data].reverse();

  const bySymbol = new Map<string, OddsSeries>();
  for (const r of rows) {
    let s = bySymbol.get(r.symbol);
    if (!s) {
      s = { symbol: r.symbol, label: r.label, eventTicker: r.event_ticker, points: [] };
      bySymbol.set(r.symbol, s);
    }
    s.points.push({ ts: r.ts, bid: px(r.bid), ask: px(r.ask), last: px(r.last), mid: px(r.mid) });
  }

  return {
    rows: rows.length,
    from: rows[0]?.ts ?? null,
    to: rows[rows.length - 1]?.ts ?? null,
    truncated: rows.length === q.limit,
    series: [...bySymbol.values()],
  };
}
