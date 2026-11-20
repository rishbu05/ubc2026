// Odds history for a market, merged from three sources (all Gemini PRODUCTION market data):
//   1. "candle"   - /v2/candles close prices (last trade), backfills history immediately
//   2. "snapshot" - partner's recorder rows in Supabase odds_snapshots (bid/ask/last/mid per minute)
//   3. "live"     - /v1/pubticker best bid/ask right now (mid = (bid+ask)/2)
// Server-only.
import "server-only";
import { supabaseAdmin } from "./supabase";
import { getCandles, getEvent, getTicker } from "./gemini";
import { DEFAULT_EVENT_TICKER } from "./markets";

export { DEFAULT_EVENT_TICKER };
/** Points per contract (series). */
export const DEFAULT_LIMIT = 100;
export const MAX_LIMIT = 5000;

export interface OddsQuery {
  symbol?: string;
  eventTicker?: string;
  /** ISO timestamp: only rows with ts >= since. */
  since?: string;
  limit?: number;
}

export type OddsSource = "candle" | "snapshot" | "live";

export interface OddsPoint {
  ts: string;
  bid: number | null;
  ask: number | null;
  last: number | null;
  mid: number | null;
  src: OddsSource;
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

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Recorder rows from Supabase (empty until the recorder logs this market). */
async function snapshotRows(q: OddsQuery & { limit: number }) {
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
  return q.since ? data : [...data].reverse();
}

/** Contracts to chart: one symbol, or every contract in the event (labels from Gemini). */
async function contractsFor(q: OddsQuery): Promise<{ symbol: string; label: string; eventTicker: string }[]> {
  const ticker = q.eventTicker ?? q.symbol?.split("-")[1] ?? DEFAULT_EVENT_TICKER;
  try {
    const ev = await getEvent(ticker, { revalidate: 300 });
    const all = ev.contracts.map((c) => ({ symbol: c.instrumentSymbol, label: c.label, eventTicker: ev.ticker }));
    return q.symbol ? all.filter((c) => c.symbol === q.symbol) : all;
  } catch {
    return q.symbol ? [{ symbol: q.symbol, label: q.symbol, eventTicker: ticker }] : [];
  }
}

/**
 * Merged history per contract, ts ascending. Each series keeps at most `limit` points
 * (the most recent ones). `since` filters every source.
 */
export async function getOddsHistory(q: OddsQuery & { limit: number }) {
  const sinceMs = q.since ? new Date(q.since).getTime() : 0;
  const [rows, contracts] = await Promise.all([snapshotRows(q), contractsFor(q)]);

  const bySymbol = new Map<string, OddsSeries>();
  const series = (symbol: string, label: string, eventTicker: string) => {
    let s = bySymbol.get(symbol);
    if (!s) bySymbol.set(symbol, (s = { symbol, label, eventTicker, points: [] }));
    return s;
  };

  await Promise.all(
    contracts.map(async (c) => {
      const s = series(c.symbol, c.label, c.eventTicker);
      const [candles, ticker] = await Promise.all([
        getCandles(c.symbol, "15m").catch(() => []),
        getTicker(c.symbol).catch(() => null),
      ]);
      for (const [t, , , , close] of candles) {
        if (t < sinceMs) continue;
        s.points.push({ ts: new Date(t).toISOString(), bid: null, ask: null, last: px(close), mid: null, src: "candle" });
      }
      if (ticker) {
        const bid = num(ticker.bid), ask = num(ticker.ask);
        s.points.push({
          ts: new Date().toISOString(),
          bid: px(bid),
          ask: px(ask),
          last: px(num(ticker.last)),
          mid: bid !== null && ask !== null ? px((bid + ask) / 2) : null,
          src: "live",
        });
      }
    }),
  );

  for (const r of rows) {
    series(r.symbol, r.label, r.event_ticker).points.push({
      ts: new Date(r.ts).toISOString(),
      bid: px(r.bid),
      ask: px(r.ask),
      last: px(r.last),
      mid: px(r.mid),
      src: "snapshot",
    });
  }

  let truncated = false;
  for (const s of bySymbol.values()) {
    s.points.sort((a, b) => a.ts.localeCompare(b.ts));
    if (s.points.length > q.limit) {
      s.points = s.points.slice(-q.limit);
      truncated = true;
    }
  }
  const all = [...bySymbol.values()].flatMap((s) => s.points);
  const counts: Record<OddsSource, number> = { candle: 0, snapshot: 0, live: 0 };
  for (const p of all) counts[p.src]++;
  const tsSorted = all.map((p) => p.ts).sort();
  return {
    rows: all.length,
    from: tsSorted[0] ?? null,
    to: tsSorted[tsSorted.length - 1] ?? null,
    truncated,
    sources: counts,
    series: [...bySymbol.values()],
  };
}
