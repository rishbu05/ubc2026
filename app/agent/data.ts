// Server-side data for the /agent dashboard (no payments: reads libs directly).
import "server-only";
import { getEvent } from "@/lib/gemini";
import { getOddsHistory } from "@/lib/odds";
import { getSpentToday, defaultAgentId } from "@/lib/ledger";
import { defaultPolicy } from "@/lib/policy";
import { supabaseAdmin } from "@/lib/supabase";
import { DEFAULT_EVENT_TICKER } from "@/lib/markets";
import type { ChartSeries } from "@/components/OddsChart";

export interface LedgerRow {
  id: number;
  ts: string;
  amount_usdc: string;
  resource_url: string;
  reason: string | null;
  tx_signature: string | null;
  status: string;
}

export interface DashboardData {
  eventTicker: string;
  title: string;
  expiry: string | null;
  chart: ChartSeries[];
  ledger: LedgerRow[];
  spentTodayUsdc: number;
  policy: { dailyCapUsdc: number; maxPerCallUsdc: number; approvalThresholdUsdc: number; tradesRequireApproval: boolean };
  agentAddress: string;
}

/** Up to 4 contracts nearest 50% (the informative strikes), colored in strike order. */
async function chartSeries(eventTicker: string): Promise<ChartSeries[]> {
  const h = await getOddsHistory({ eventTicker, limit: 96 });
  const all = h.series
    .map((s) => ({
      symbol: s.symbol,
      label: s.label,
      points: s.points
        .map((p) => ({ t: new Date(p.ts).getTime(), v: (p.mid ?? p.last) as number, src: p.src }))
        .filter((p) => p.v !== null && Number.isFinite(p.v)),
    }))
    .filter((s) => s.points.length > 1);
  const informative = all
    .filter((s) => {
      const v = s.points[s.points.length - 1].v;
      return v > 0.05 && v < 0.95;
    })
    .sort((a, b) => Math.abs(a.points[a.points.length - 1].v - 0.5) - Math.abs(b.points[b.points.length - 1].v - 0.5))
    .slice(0, 4);
  return informative.sort((a, b) => a.symbol.localeCompare(b.symbol, undefined, { numeric: true }));
}

export async function recentLedger(limit = 15): Promise<LedgerRow[]> {
  const { data, error } = await supabaseAdmin()
    .from("spend_ledger")
    .select("id,ts,amount_usdc,resource_url,reason,tx_signature,status")
    .eq("agent_id", defaultAgentId())
    .order("ts", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`ledger: ${error.message}`);
  return data as LedgerRow[];
}

export async function getDashboardData(eventTicker = DEFAULT_EVENT_TICKER): Promise<DashboardData> {
  const p = defaultPolicy();
  const [ev, chart, ledger, spent] = await Promise.all([
    getEvent(eventTicker, { revalidate: 60 }),
    chartSeries(eventTicker),
    recentLedger(),
    getSpentToday(),
  ]);
  return {
    eventTicker,
    title: ev.title,
    expiry: ev.expiryDate ?? null,
    chart,
    ledger,
    spentTodayUsdc: spent,
    policy: {
      dailyCapUsdc: p.dailyCapUsdc,
      maxPerCallUsdc: p.maxPerCallUsdc,
      approvalThresholdUsdc: p.approvalThresholdUsdc,
      tradesRequireApproval: p.tradesRequireApproval ?? true,
    },
    agentAddress: process.env.NEXT_PUBLIC_AGENT_WALLET_ADDRESS ?? "",
  };
}
