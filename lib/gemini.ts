// Gemini = the Gemini crypto EXCHANGE's Prediction Markets REST API.
// NOT Google Gemini AI. Do not add @google/genai or any LLM SDK here.
//
// Docs: https://developer.gemini.com/prediction-markets-spec
// Base URL defaults to the SANDBOX (https://api.sandbox.gemini.com). Prod is https://api.gemini.com.
// Public endpoints (events, order book) need no key. Private endpoints (orders) are HMAC-signed.
import "server-only";
import crypto from "node:crypto";

export const GEMINI_BASE_URL =
  process.env.GEMINI_API_BASE_URL ?? "https://api.sandbox.gemini.com";

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

async function parse<T>(res: Response): Promise<T> {
  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* non-JSON body */
  }
  if (!res.ok) throw new GeminiApiError(res.status, body);
  return body as T;
}

async function publicGet<T>(path: string): Promise<T> {
  const res = await fetch(`${GEMINI_BASE_URL}${path}`, { cache: "no-store" });
  return parse<T>(res);
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
  const payload = Buffer.from(
    JSON.stringify({ request: path, nonce: nextNonce(), ...fields }),
  ).toString("base64");
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
export function getEvent(eventTicker: string) {
  return publicGet<PredictionEvent>(
    `/v1/prediction-markets/events/${encodeURIComponent(eventTicker)}`,
  );
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
