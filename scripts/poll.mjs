// Gemini prediction-market odds poller -> Supabase
// Usage:
//   node poll.mjs                 -> lists active events so you can pick tickers
//   EVENTS=TICKER1,TICKER2 node poll.mjs   -> snapshots those events every 60s
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, EVENTS (optional), INTERVAL_MS (optional)

import { createClient } from "@supabase/supabase-js";

const BASE = "https://api.gemini.com/v1/prediction-markets";
const EVENTS = (process.env.EVENTS || "").split(",").map(s => s.trim()).filter(Boolean);
const INTERVAL_MS = Number(process.env.INTERVAL_MS || 60_000);

async function getJson(url) {
  const r = await fetch(url, { headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(`${r.status} ${url}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

// Price field names aren't pinned down in the docs, so try common ones.
// Raw JSON is stored either way, so nothing is lost if this misses.
const num = v => (v === null || v === undefined || v === "" || isNaN(Number(v)) ? null : Number(v));
function pick(obj, names) {
  for (const src of [obj, obj?.prices, obj?.price, obj?.quote]) {
    if (!src || typeof src !== "object") continue;
    for (const n of names) if (num(src[n]) !== null) return num(src[n]);
  }
  return null;
}

// ---- list mode: no EVENTS set ----
if (EVENTS.length === 0) {
  const cat = process.env.CATEGORY ? `&category=${encodeURIComponent(process.env.CATEGORY)}` : "";
  const data = await getJson(`${BASE}/events?status=active&limit=100${cat}`);
  const events = Array.isArray(data) ? data : data.data || data.events || [];
  for (const e of events) {
    const exp = (e.contracts || []).map(c => c.expiryDate).filter(Boolean).sort().pop() || "?";
    console.log(`${e.ticker || e.eventTicker}  |  ${e.category}  |  expires ${exp}  |  ${e.title || e.name}`);
  }
  console.log("\nPick 2-3 tickers and rerun with EVENTS=TICKER1,TICKER2");
  process.exit(0);
}

// ---- poll mode ----
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function snapshot() {
  const rows = [];
  for (const ticker of EVENTS) {
    try {
      const ev = await getJson(`${BASE}/events/${encodeURIComponent(ticker)}`);
      const event = ev.data || ev;
      const contracts = event.contracts || event.markets || [];
      for (const c of contracts) {
        const bid = pick(c, ["bestBid", "bid", "buyPrice", "yesBid"]);
        const ask = pick(c, ["bestAsk", "ask", "sellPrice", "yesAsk"]);
        const last = pick(c, ["lastTradePrice", "lastPrice", "last", "price"]);
        rows.push({
          event_ticker: ticker,
          symbol: c.instrumentSymbol || c.symbol || c.ticker || null,
          label: c.label || c.title || c.name || null,
          bid, ask, last,
          mid: bid !== null && ask !== null ? (bid + ask) / 2 : last,
          raw: { ...c, description: undefined },
        });
      }
    } catch (err) {
      console.error(new Date().toISOString(), ticker, err.message);
    }
  }
  if (rows.length) {
    const { error } = await supabase.from("odds_snapshots").insert(rows);
    if (error) console.error("supabase:", error.message);
    else console.log(new Date().toISOString(), `saved ${rows.length} rows`, rows.slice(0, 2).map(r => `${r.symbol}=${r.mid}`).join(" "));
  }
}

await snapshot();
setInterval(snapshot, INTERVAL_MS);
