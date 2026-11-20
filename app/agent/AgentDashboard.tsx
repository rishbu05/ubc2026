"use client";
import { useEffect, useState, useTransition } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import OddsChart from "@/components/OddsChart";
import ApprovalModal from "@/components/ApprovalModal";
import type { AgentRunResult } from "@/lib/agent";
import type { ExecutionResult } from "@/lib/trade";
import { executeTradeAction, refreshLedgerAction, runAgentAction } from "./actions";
import type { DashboardData } from "./data";

const DEFAULT_TASK =
  "Look at the BTC Nov 30 market. Buy only the data you need within budget, then propose one small sandbox trade if you see an edge.";

const short = (s: string, n = 6) => (s.length > 2 * n + 1 ? `${s.slice(0, n)}…${s.slice(-n)}` : s);
const usd = (n: number | string) => `$${Number(n).toFixed(2)}`;

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[#1e2d4a] bg-[#0f1b33] px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="font-mono text-sm tabular-nums text-slate-100">{value}</div>
    </div>
  );
}

export default function AgentDashboard({ initial }: { initial: DashboardData }) {
  const { publicKey } = useWallet();
  const [task, setTask] = useState(DEFAULT_TASK);
  const [run, setRun] = useState<AgentRunResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, startRun] = useTransition();
  const [elapsed, setElapsed] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [execution, setExecution] = useState<ExecutionResult | null>(null);
  const [executing, startExec] = useTransition();
  const [ledger, setLedger] = useState(initial.ledger);
  const [spentToday, setSpentToday] = useState(initial.spentTodayUsdc);

  useEffect(() => {
    if (!running) return;
    const t0 = Date.now();
    const id = setInterval(() => setElapsed(Math.round((Date.now() - t0) / 1000)), 500);
    return () => clearInterval(id);
  }, [running]);

  const refresh = async () => {
    const r = await refreshLedgerAction();
    setLedger(r.ledger);
    setSpentToday(r.spentTodayUsdc);
  };

  function onRun() {
    setError(null);
    setRun(null);
    setExecution(null);
    setElapsed(0);
    startRun(async () => {
      const r = await runAgentAction({ task, approver: publicKey?.toBase58() });
      if (!r.ok) setError(r.error);
      else setRun(r.result);
      await refresh();
    });
  }

  function onApproved() {
    const p = run?.proposal;
    if (!p) return;
    setModalOpen(false);
    startExec(async () => {
      const r = await executeTradeAction(p.approvalId, p.order);
      if (!r.ok) setError(r.error);
      else setExecution(r.result);
      await refresh();
    });
  }

  const p = initial.policy;

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-xs text-orange-400">{initial.eventTicker}</p>
          <h1 className="text-2xl font-semibold">{initial.title}</h1>
          <p className="text-sm text-slate-400">
            Market data: Gemini production · Orders: Gemini sandbox · Payments: Solana devnet USDC
            {initial.expiry && ` · Expires ${new Date(initial.expiry).toLocaleString()}`}
          </p>
        </div>
        <WalletMultiButton />
      </header>

      <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Chip label="Spent today" value={`${usd(spentToday)} / ${usd(p.dailyCapUsdc)}`} />
        <Chip label="Max per data call" value={usd(p.maxPerCallUsdc)} />
        <Chip label="Approval above" value={usd(p.approvalThresholdUsdc)} />
        <Chip label="Trades" value={p.tradesRequireApproval ? "always need approval" : `approval > ${usd(p.approvalThresholdUsdc)}`} />
      </section>

      <section className="rounded-2xl border border-[#1e2d4a] bg-[#0b1426] p-4">
        <OddsChart series={initial.chart} title="Implied probability by strike" />
      </section>

      <section className="space-y-3 rounded-2xl border border-[#1e2d4a] bg-[#0b1426] p-4">
        <label className="block space-y-1">
          <span className="text-xs uppercase tracking-wide text-slate-400">Task for the agent</span>
          <textarea
            value={task}
            onChange={(e) => setTask(e.target.value)}
            rows={2}
            maxLength={1000}
            className="w-full rounded-lg border border-[#2a3b5e] bg-[#0f1b33] px-3 py-2 text-sm"
          />
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={onRun}
            disabled={running || !task.trim()}
            className="rounded-lg bg-orange-500 px-5 py-2.5 font-medium text-[#0b1426] hover:bg-orange-400 disabled:opacity-50"
          >
            {running ? `Agent working… ${elapsed}s` : "Run agent"}
          </button>
          <span className="text-xs text-slate-400">
            {publicKey
              ? `Trades will need approval from ${short(publicKey.toBase58(), 4)}`
              : "Connect Phantom (Devnet) so the trade approval is bound to your wallet"}
          </span>
        </div>
        {error && <p className="break-words text-sm text-red-400">{error}</p>}
      </section>

      {run && (
        <section className="space-y-3 rounded-2xl border border-[#1e2d4a] bg-[#0b1426] p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-semibold">Agent run</h2>
            <span className="font-mono text-xs text-slate-400">
              {run.model} · {(run.ms / 1000).toFixed(1)}s · spent {usd(run.spentThisRunUsdc)} this run
            </span>
          </div>
          <ol className="space-y-2">
            {run.steps.map((s, i) => (
              <li key={i} className="rounded-lg bg-[#0f1b33] p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`font-mono text-xs ${s.ok ? "text-orange-400" : "text-red-400"}`}>{s.tool}</span>
                  {s.costUsdc !== undefined && <span className="font-mono text-xs text-slate-300">paid {usd(s.costUsdc)}</span>}
                  {s.policy && <span className="rounded bg-[#13213d] px-1.5 py-0.5 font-mono text-[10px] text-slate-400">policy: {s.policy.action}</span>}
                  {s.explorerUrl && (
                    <a href={s.explorerUrl} target="_blank" rel="noreferrer" className="font-mono text-xs text-orange-400 underline">
                      {short(s.txSignature ?? "", 6)}
                    </a>
                  )}
                  <span className="ml-auto font-mono text-[10px] text-slate-500">{(s.ms / 1000).toFixed(1)}s</span>
                </div>
                <p className="mt-1 break-words text-slate-300">{s.summary}</p>
              </li>
            ))}
          </ol>
          <div className="rounded-lg border border-[#2a3b5e] p-3">
            <p className="text-xs uppercase tracking-wide text-slate-400">Agent&apos;s conclusion</p>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{run.finalText}</p>
          </div>

          {run.proposal && !execution && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-orange-500/40 bg-orange-500/10 p-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-orange-300">Trade proposal #{run.proposal.approvalId}</p>
                <p className="font-mono text-sm">{run.proposal.description}</p>
              </div>
              <button
                onClick={() => setModalOpen(true)}
                disabled={executing}
                className="rounded-lg bg-orange-500 px-4 py-2 font-medium text-[#0b1426] hover:bg-orange-400 disabled:opacity-50"
              >
                {executing ? "Placing sandbox order…" : "Review & approve"}
              </button>
            </div>
          )}

          {execution && (
            <div
              className={`rounded-lg border p-3 text-sm ${
                execution.mode === "sandbox" ? "border-emerald-500/40 bg-emerald-500/10" : "border-amber-500/40 bg-amber-500/10"
              }`}
            >
              {execution.mode === "sandbox" && (
                <>
                  <p className="font-medium text-emerald-300">Real Gemini sandbox order placed ✓</p>
                  <p className="mt-1 font-mono text-xs">
                    order id {execution.orderId} · status {execution.status}
                    {execution.alreadyExecuted ? " (already executed)" : ""}
                  </p>
                </>
              )}
              {execution.mode === "paper" && (
                <>
                  <p className="font-medium text-amber-300">PAPER TRADE (simulated, not sent to an exchange)</p>
                  <p className="mt-1 text-xs text-slate-300">{execution.reason}</p>
                </>
              )}
              {execution.mode === "not_executed" && <p className="text-amber-300">Not executed: {execution.reason}</p>}
            </div>
          )}
        </section>
      )}

      <section className="rounded-2xl border border-[#1e2d4a] bg-[#0b1426] p-4">
        <h2 className="mb-2 font-semibold">Spend ledger</h2>
        <div className="overflow-x-auto">
          <table className="w-full font-mono text-xs">
            <thead className="text-left text-slate-500">
              <tr><th className="py-1 pr-3">Time</th><th className="py-1 pr-3">Status</th><th className="py-1 pr-3 text-right">USDC</th><th className="py-1 pr-3">Resource</th><th className="py-1">Note</th></tr>
            </thead>
            <tbody className="text-slate-300">
              {ledger.map((r) => (
                <tr key={r.id} className="border-t border-[#1e2d4a] align-top">
                  <td className="py-1 pr-3 whitespace-nowrap">{new Date(r.ts).toLocaleTimeString()}</td>
                  <td className="py-1 pr-3">{r.status}</td>
                  <td className="py-1 pr-3 text-right tabular-nums">{Number(r.amount_usdc).toFixed(2)}</td>
                  <td className="py-1 pr-3 break-all">{r.resource_url.replace(/^https?:\/\/[^/]+/, "")}</td>
                  <td className="py-1 break-words text-slate-400">
                    {r.reason}
                    {r.tx_signature && r.status === "paid" && !r.resource_url.startsWith("gemini") && (
                      <> · <a className="text-orange-400 underline" target="_blank" rel="noreferrer" href={`https://explorer.solana.com/tx/${r.tx_signature}?cluster=devnet`}>{short(r.tx_signature, 5)}</a></>
                    )}
                  </td>
                </tr>
              ))}
              {ledger.length === 0 && <tr><td colSpan={5} className="py-2 text-slate-500">No spend yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {modalOpen && run?.proposal && (
        <ApprovalModal
          approvalId={run.proposal.approvalId}
          amountUsdc={run.proposal.notional}
          description={run.proposal.description}
          onApproved={onApproved}
          onRejected={() => setModalOpen(false)}
        />
      )}
    </div>
  );
}
