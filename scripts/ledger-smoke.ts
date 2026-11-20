// Live check of lib/ledger.ts against Supabase: records a test spend under a throwaway agent id,
// reads it back via getSpentToday(), then deletes the test rows.
// Usage: npm run ledger:smoke   (needs supabase/migrations/0002_spend_ledger.sql applied)
import { getSpentToday, recordSpend } from "@/lib/ledger";
import { supabaseAdmin } from "@/lib/supabase";

async function main() {
  const agentId = `smoke-${Date.now()}`;
  try {
    const before = await getSpentToday(agentId);
    await recordSpend({ agentId, amountUsdc: 0.01, resourceUrl: "/api/paid/odds-history", status: "paid", reason: "smoke" });
    await recordSpend({ agentId, amountUsdc: 0.02, resourceUrl: "/api/paid/news", status: "paid", reason: "smoke" });
    await recordSpend({ agentId, amountUsdc: 0.5, resourceUrl: "/api/paid/analysis", status: "blocked", reason: "smoke" });
    const after = await getSpentToday(agentId);
    console.log(`spent before=${before} after=${after} (expected 0 -> 0.03; blocked row not counted)`);
    if (before !== 0 || after !== 0.03) process.exitCode = 1;
  } finally {
    await supabaseAdmin().from("spend_ledger").delete().eq("agent_id", agentId);
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
