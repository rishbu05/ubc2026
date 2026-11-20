// Gemini = the Gemini crypto EXCHANGE's Prediction Markets REST API.
// NOT Google Gemini AI. Do not add @google/genai or any LLM SDK here.
//
// Docs: https://developer.gemini.com/prediction-markets-spec
// Two hosts, on purpose:
//   - MARKET DATA (public, no key): GEMINI_MARKET_DATA_URL, default PRODUCTION https://api.gemini.com
//   - ORDERS (signed): GEMINI_API_BASE_URL, default SANDBOX https://api.sandbox.gemini.com
// Never place orders on production from this app.
import "server-only";
import crypto from "node:crypto";

/** Signed trading endpoints (orders, positions). SANDBOX by default. */
export const GEMINI_BASE_URL =
  process.env.GEMINI_API_BASE_URL ?? "https://api.sandbox.gemini.com";

/** Public market data (events, books, candles, tickers). PRODUCTION by default. */
export const GEMINI_MARKET_DATA_URL =
  process.env.GEMINI_MARKET_DATA_URL ?? "https://api.gemini.com";

// ── Types (subset of fields; responses contain more) ────────────────────

export type Outcome = "yes" | "no";
export type Side = "buy" | "sell";

export interface ContractPrices {
  buy?: { yes?: string; no?: string };
  sell?: { yes?: string; no?: string };
  bestBid?: string;
  bestAsk?: string;
  lastTradePrice?: string;
}

export interface Contract {
  id: string;
  label: string;
  ticker: string;
  /** Pass this as `symbol` to order/book endpoints. Never construct it by hand. */
  instrumentSymbol: string;
  status: string;
  marketState?: string;
  prices?: ContractPrices;
  expiryDate?: string;
  quantityIncrement?: string;
  quantityMinimum?: string;
  priceIncrement?: string;
  priceMinimum?: string;
  [key: string]: unknown;
}

export interface PredictionEvent {
  id: string;
  title: string;
  ticker: string;
  type: string;
  category: string;
  status: string;
  contracts: Contract[];
  expiryDate?: string;
  [key: string]: unknown;
}

export interface EventsPage {
  data: PredictionEvent[];
  pagination: { limit: number; offset: number; total: number };
}

export interface BookLevel {
  price: string;
  amount: string;
  timestamp: string;
}

export interface OrderBook {
  bids: BookLevel[];
  asks: BookLevel[];
}

export interface PlaceOrderOptions {
  outcome?: Outcome; // default "yes"
  timeInForce?: "good-til-cancel" | "immediate-or-cancel" | "fill-or-kill";
  makerOrCancel?: boolean;
}

// ── HTTP helpers ────────────────────────────────────────────────────────

export class GeminiApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown) {
    const reason =
      typeof body === "object" && body && "reason" in body
        ? String((body as { reason: unknown }).reason)
        : "";
    super(`Gemini API ${status}${reason ? `: ${reason}` : ""}`);
    this.status = status;
    this.body = body;
  }
}

/**
 * Gemini order ids exceed Number.MAX_SAFE_INTEGER (e.g. 145853902325052770), so JSON.parse would
 * silently round them. Quote any long integer id fields before parsing so they stay exact strings.
 */
const BIG_ID_FIELDS = /("(?:orderId|globalOrderId|tid|order_id|id)"\s*:\s*)(\d{16,})/g;

async function parse<T>(res: Response): Promise<T> {
  const text = (await res.text()).replace(BIG_ID_FIELDS, '$1"$2"');
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* non-JSON body */
  }
  if (!res.ok) throw new GeminiApiError(res.status, body);
  return body as T;
}

async function publicGet<T>(path: string, opts: { base?: string; revalidate?: number } = {}): Promise<T> {
  const base = opts.base ?? GEMINI_MARKET_DATA_URL;
  const res = await fetch(
    `${base}${path}`,
    opts.revalidate ? { next: { revalidate: opts.revalidate } } : { cache: "no-store" },
  );
  return parse<T>(res);
}

/** Marks a numeric id that must be sent as an exact integer (too big for a JS number). */
class BigIntId {
  constructor(readonly digits: string) {
    if (!/^\d+$/.test(digits)) throw new Error(`Invalid order id: ${digits}`);
  }
}

// Nonce must strictly increase per API key. Millisecond timestamps, bumped if two calls share a ms.
let lastNonce = 0;
function nextNonce(): number {
  lastNonce = Math.max(Date.now(), lastNonce + 1);
  return lastNonce;
}

/**
 * Signed private POST. Gemini's scheme: the JSON payload (incl. `request` path and `nonce`)
 * is base64-encoded into X-GEMINI-PAYLOAD; X-GEMINI-SIGNATURE = hex(HMAC-SHA384(payloadB64, secret)).
 * The HTTP body is empty.
 */
async function privatePost<T>(path: string, fields: Record<string, unknown>): Promise<T> {
  const apiKey = process.env.GEMINI_API_KEY;
  const apiSecret = process.env.GEMINI_API_SECRET;
  if (!apiKey || !apiSecret) {
    throw new Error("Missing GEMINI_API_KEY / GEMINI_API_SECRET (Gemini exchange sandbox key)");
  }
  // Fields wrapped in BigIntId are emitted as exact unquoted integers (order ids > 2^53).
  const json = JSON.stringify({ request: path, nonce: nextNonce(), ...fields }, (_k, v) =>
    v instanceof BigIntId ? `__BIGINT__${v.digits}__` : v,
  ).replace(/"__BIGINT__(\d+)__"/g, "$1");
  const payload = Buffer.from(json).toString("base64");
  const signature = crypto.createHmac("sha384", apiSecret).update(payload).digest("hex");

  const res = await fetch(`${GEMINI_BASE_URL}${path}`, {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "text/plain",
      "Content-Length": "0",
      "Cache-Control": "no-cache",
      "X-GEMINI-APIKEY": apiKey,
      "X-GEMINI-PAYLOAD": payload,
      "X-GEMINI-SIGNATURE": signature,
    },
  });
  return parse<T>(res);
}

// ── Public ──────────────────────────────────────────────────────────────

/** GET /v1/prediction-markets/events?status=active */
export function listActiveEvents(opts: { limit?: number; offset?: number } = {}) {
  const q = new URLSearchParams({ status: "active" });
  if (opts.limit !== undefined) q.set("limit", String(opts.limit));
  if (opts.offset !== undefined) q.set("offset", String(opts.offset));
  return publicGet<EventsPage>(`/v1/prediction-markets/events?${q}`);
}

/** GET /v1/prediction-markets/events/{eventTicker} */
export function getEvent(eventTicker: string, opts: { venue?: "market-data" | "sandbox"; revalidate?: number } = {}) {
  return publicGet<PredictionEvent>(`/v1/prediction-markets/events/${encodeURIComponent(eventTicker)}`, {
    base: opts.venue === "sandbox" ? GEMINI_BASE_URL : GEMINI_MARKET_DATA_URL,
    revalidate: opts.revalidate,
  });
}

/**
 * GET /v1/book/{instrumentSymbol}. The standard Gemini book endpoint accepts
 * prediction-market instrument symbols (e.g. GEMI-SOL2611192200-HI69).
 */
export function getOrderBook(instrumentSymbol: string, depth?: number) {
  const q = depth !== undefined ? `?limit_bids=${depth}&limit_asks=${depth}` : "";
  return publicGet<OrderBook>(`/v1/book/${encodeURIComponent(instrumentSymbol)}${q}`);
}

// ── Private (signed) ────────────────────────────────────────────────────

/**
 * POST /v1/prediction-markets/order. Limit order only (REST supports limit/stop-limit).
 * `price` is 0–1 (probability), `quantity` is number of contracts. Key needs the Trader role,
 * and the account must have accepted the latest prediction-markets terms.
 */
export function placeOrder(
  symbol: string,
  side: Side,
  quantity: string | number,
  price: string | number,
  opts: PlaceOrderOptions = {},
) {
  const p = Number(price);
  if (!(p > 0 && p < 1)) throw new Error(`price must be between 0 and 1, got ${price}`);
  if (!(Number(quantity) > 0)) throw new Error(`quantity must be positive, got ${quantity}`);

  return privatePost<Record<string, unknown>>("/v1/prediction-markets/order", {
    symbol,
    orderType: "limit",
    side,
    quantity: String(quantity),
    price: String(price),
    outcome: opts.outcome ?? "yes",
    timeInForce: opts.timeInForce ?? "good-til-cancel",
    ...(opts.makerOrCancel !== undefined && { makerOrCancel: opts.makerOrCancel }),
  });
}

/** POST /v1/prediction-markets/orders/active (signed, read-only). */
export function listActiveOrders(symbol?: string) {
  return privatePost<unknown>("/v1/prediction-markets/orders/active", symbol ? { symbol } : {});
}

/** POST /v1/prediction-markets/positions (signed, read-only). */
export function listPositions() {
  return privatePost<unknown>("/v1/prediction-markets/positions", {});
}

// ── Price history (production market data) ─────────────────────────────

export type CandleTimeframe = "1m" | "5m" | "15m" | "30m" | "1hr" | "6hr" | "1day";

/** One candle: [timeMs, open, high, low, close, volume]. Close = last trade price. */
export type Candle = [number, number, number, number, number, number];

/** GET /v2/candles/{symbol}/{timeframe}, newest first. Works for prediction contract symbols. */
export function getCandles(symbol: string, timeframe: CandleTimeframe = "15m", revalidate = 60) {
  return publicGet<Candle[]>(`/v2/candles/${encodeURIComponent(symbol)}/${timeframe}`, { revalidate });
}

export interface Ticker {
  bid: string | null;
  ask: string | null;
  last: string | null;
}

/** GET /v1/pubticker/{symbol}: live best bid/ask + last trade. */
export function getTicker(symbol: string, revalidate = 15) {
  return publicGet<Ticker>(`/v1/pubticker/${encodeURIComponent(symbol)}`, { revalidate });
}

/** POST /v1/prediction-markets/order/cancel (signed, sandbox). */
export function cancelOrder(orderId: string) {
  return privatePost<Record<string, unknown>>("/v1/prediction-markets/order/cancel", { orderId: new BigIntId(String(orderId)) });
}
