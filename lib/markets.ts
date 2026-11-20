// Demo markets. Market data comes from Gemini PRODUCTION; orders go to SANDBOX.
// BTC2611302200 is the default because it exists on BOTH with identical contract symbols.

export interface MarketInfo {
  eventTicker: string;
  /** News search topic for /api/paid/news. */
  newsTopic: string;
  /** Whether sandbox has this event, so real sandbox orders are possible. */
  sandboxTradable: boolean;
}

export const MARKETS: Record<string, MarketInfo> = {
  BTC2611302200: { eventTicker: "BTC2611302200", newsTopic: "Bitcoin price", sandboxTradable: true },
  FED261211: { eventTicker: "FED261211", newsTopic: "Federal Reserve interest rate decision", sandboxTradable: false },
  SPXEND26: { eventTicker: "SPXEND26", newsTopic: "S&P 500", sandboxTradable: false },
};

export const DEFAULT_EVENT_TICKER = "BTC2611302200";
