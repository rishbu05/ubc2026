// /agent: run the Claude agent on the demo market, approve its trade, see the sandbox order.
import { getDashboardData } from "./data";
import AgentDashboard from "./AgentDashboard";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // the agent run (server action) can take a minute or two

export default async function AgentPage() {
  const data = await getDashboardData();
  return (
    <main className="min-h-screen bg-[#060c18] px-4 py-6 text-slate-100">
      <AgentDashboard initial={data} />
    </main>
  );
}
