"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import OddsChart from "@/components/OddsChart";
import ApprovalModal, { type ApprovalResult } from "@/components/ApprovalModal";
import BudgetRing from "@/components/BudgetRing";
import Confetti, { makeConfetti, type ConfettiPiece } from "@/components/Confetti";
import { ToastStack, useToasts } from "@/components/Toasts";
import type { AgentRunResult, AgentStep } from "@/lib/agent";
import type { ExecutionResult } from "@/lib/trade";
import { executeTradeAction, refreshLedgerAction, runAgentAction } from "./actions";
import type { DashboardData } from "./data";

const DEFAULT_TASK =
  "Look at the BTC Nov 30 market and buy only the data you need within budget. This is a sandbox demo: propose exactly one small trade (notional under $2) on a sandbox-tradable contract, with the best risk/reward you can justify.";

const STEP_MS = 380; // replay cadence for steps / toasts / budget ticks

const short = (s: string, n = 6) => (s.length > 2 * n + 1 ? `${s.slice(0, n)}…${s.slice(-n)}` : s);
const usd = (n: number | string) => `$${Number(n).toFixed(2)}`;
const endpoint = (tool: string) => tool.replace(/^buy_/, "").replace(/_/g, "-");

function stepKind(s: AgentStep): "block" | "pay" | "approval" | "think" | "ok" {
  if (!s.ok || s.policy?.action === "block") return "block";
  if (s.costUsdc !== undefined) return "pay";
  if (s.tool === "propose_trade") return s.policy?.action === "require_approval" ? "approval" : "ok";
  return "think";
}
const LINE = { block: "line-block", pay: "line-pay", approval: "line-pay", think: "line-think", ok: "line-ok" } as const;
const TAG = {
  block: "text-[var(--acc-block)]",
  pay: "text-[var(--acc-pay)]",
  approval: "text-[var(--acc-pay)]",
  think: "text-[var(--acc-think)]",
  ok: "text-[var(--acc-ok)]",
} as const;

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--navy-line)] bg-[var(--navy-2)] px-3 py-2">
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

  // Presentation-only state
  const { toasts, push, dismiss } = useToasts();
  const [revealed, setRevealed] = useState(0);
  const [displayedSpent, setDisplayedSpent] = useState(initial.spentTodayUsdc);
  const [celebrate, setCelebrate] = useState<{ orderId: string; pieces: ConfettiPiece[] } | null>(null);
  const spentBeforeRun = useRef(initial.spentTodayUsdc);
  const latestSpent = useRef(initial.spentTodayUsdc);
  useEffect(() => {
    latestSpent.current = spentToday;
  }, [spentToday]);

  useEffect(() => {
    if (!running) return;
    const t0 = Date.now();
    const id = setInterval(() => setElapsed(Math.round((Date.now() - t0) / 1000)), 500);
    return () => clearInterval(id);
  }, [running]);

  // Replay the finished run: reveal steps one by one, toast each event, tick the budget ring.
  useEffect(() => {
    if (!run) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));
    let spent = spentBeforeRun.current;
    run.steps.forEach((s, i) => {
      at(i * STEP_MS, () => {
        setRevealed(i + 1);
        const kind = stepKind(s);
        if (kind === "pay") {
          spent += s.costUsdc ?? 0;
          const v = spent;
          setDisplayedSpent(v);
          push({ kind: "pay", title: `Paid ${usd(s.costUsdc ?? 0)} · ${endpoint(s.tool)}`, href: s.explorerUrl });
        } else if (kind === "block") {
          push({ kind: "block", title: `Blocked: ${s.tool}`, detail: s.policy?.reason ?? s.summary });
        }
      });
    });
    const end = run.steps.length * STEP_MS;
    const injected = run.steps.some((s) => s.tool === "buy_news" && /injection/i.test(s.summary)) && /inject/i.test(run.finalText);
    if (injected) at(end, () => push({ kind: "block", title: "Blocked: prompt injection", detail: "A headline told the agent to send funds. It refused." }));
    if (run.proposal) {
      const p = run.proposal;
      at(end + 150, () => push({ kind: "approval", title: "Approval needed", detail: p.description }));
    }
    at(end + 200, () => {
      setRevealed(Number.MAX_SAFE_INTEGER);
      setDisplayedSpent(latestSpent.current);
    });
    return () => timers.forEach(clearTimeout);
  }, [run, push]);

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
    setRevealed(0);
    spentBeforeRun.current = spentToday;
    startRun(async () => {
      const r = await runAgentAction({ task, approver: publicKey?.toBase58() });
      if (!r.ok) {
        setError(r.error);
        push({ kind: "block", title: "Run not started", detail: r.error });
      } else setRun(r.result);
      await refresh();
    });
  }

  function onApproved(approval?: ApprovalResult) {
    const p = run?.proposal;
    if (!p) return;
    setModalOpen(false);
    push({ kind: "ok", title: "Approved onchain ✓", detail: approval ? `signed by ${short(approval.approver, 4)}` : undefined, href: approval?.explorerUrl });
    startExec(async () => {
      const r = await executeTradeAction(p.approvalId, p.order);
      if (!r.ok) setError(r.error);
      else {
        setExecution(r.result);
        if (r.result.mode === "sandbox") setCelebrate({ orderId: r.result.orderId, pieces: makeConfetti() });
        else if (r.result.mode === "paper") push({ kind: "approval", title: "Recorded as PAPER trade", detail: r.result.reason });
        else push({ kind: "block", title: "Not executed", detail: r.result.reason });
      }
      await refresh();
    });
  }

  const p = initial.policy;
  const visibleSteps = run ? run.steps.slice(0, revealed) : [];
  const replayDone = run ? revealed >= run.steps.length + 1 : false;

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-xs text-[var(--acc-pay)]">{initial.eventTicker}</p>
          <h1 className="text-2xl font-semibold">{initial.title}</h1>
          <p className="text-sm text-slate-400">
            Market data: Gemini production · Orders: Gemini sandbox · Payments: Solana devnet USDC
            {initial.expiry && ` · Expires ${new Date(initial.expiry).toLocaleString()}`}
          </p>
        </div>
        <WalletMultiButton />
      </header>

      <section className="flex flex-wrap items-center gap-4 rounded-2xl border border-[var(--navy-line)] bg-[var(--navy-1)] p-4">
        <BudgetRing spent={displayedSpent} cap={p.dailyCapUsdc} />
        <div className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-3">
          <Chip label="Max per data call" value={usd(p.maxPerCallUsdc)} />
          <Chip label="Approval above" value={usd(p.approvalThresholdUsdc)} />
          <Chip label="Trades" value={p.tradesRequireApproval ? "always need approval" : `approval > ${usd(p.approvalThresholdUsdc)}`} />
        </div>
      </section>

      <section className="rounded-2xl border border-[var(--navy-line)] bg-[var(--navy-1)] p-4">
        <OddsChart series={initial.chart} title="Implied probability by strike" />
      </section>

      <div className="glow-card">
        <section className="space-y-3 rounded-2xl border border-[var(--navy-line)] bg-[var(--navy-1)]/95 p-4">
          <label className="block space-y-1">
            <span className="text-xs uppercase tracking-wide text-slate-400">Task for the agent</span>
            <textarea
              value={task}
              onChange={(e) => setTask(e.target.value)}
              rows={2}
              maxLength={1000}
              className="w-full rounded-lg border border-[#2a3b5e] bg-[var(--navy-2)] px-3 py-2 text-sm focus:border-[var(--acc-think)] focus:outline-none"
            />
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={onRun}
              disabled={running || !task.trim()}
              className="rounded-lg bg-[var(--acc-pay)] px-5 py-2.5 font-medium text-[var(--navy-1)] shadow-lg shadow-orange-500/20 transition hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
            >
              {running ? `Agent working… ${elapsed}s` : "Run agent"}
            </button>
            {running ? (
              <span className="flex items-center gap-2 text-sm text-[var(--acc-think)]" aria-live="polite">
                <span className="flex gap-1">
                  <span className="think-dot" />
                  <span className="think-dot" style={{ animationDelay: "150ms" }} />
                  <span className="think-dot" style={{ animationDelay: "300ms" }} />
                </span>
                Claude is thinking and buying data…
              </span>
            ) : (
              <span className="text-xs text-slate-400">
                {publicKey
                  ? `Trades will need approval from ${short(publicKey.toBase58(), 4)}`
                  : "Connect Phantom (Devnet) so the trade approval is bound to your wallet"}
              </span>
            )}
          </div>
          {error && <p className="break-words text-sm text-[var(--acc-block)]">{error}</p>}
        </section>
      </div>

      {run && (
        <section className="space-y-3 rounded-2xl border border-[var(--navy-line)] bg-[var(--navy-1)] p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-semibold">Agent run</h2>
            <span className="font-mono text-xs text-slate-400">
              {run.model} · {(run.ms / 1000).toFixed(1)}s · spent {usd(run.spentThisRunUsdc)} this run
            </span>
          </div>
          <ol className="space-y-2 font-mono">
            {visibleSteps.map((s, i) => {
              const k = stepKind(s);
              return (
                <li key={i} className={`anim-step-in rounded-lg bg-[var(--navy-2)] p-3 text-sm ${LINE[k]}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`text-xs ${TAG[k]}`}>{s.tool}</span>
                    {s.costUsdc !== undefined && <span className="text-xs text-[var(--acc-pay)]">paid {usd(s.costUsdc)}</span>}
                    {s.policy && (
                      <span className={`rounded bg-[#13213d] px-1.5 py-0.5 text-[10px] ${s.policy.action === "block" ? "text-[var(--acc-block)]" : s.policy.action === "allow" ? "text-[var(--acc-ok)]" : "text-[var(--acc-pay)]"}`}>
                        policy: {s.policy.action}
                      </span>
                    )}
                    {s.explorerUrl && (
                      <a href={s.explorerUrl} target="_blank" rel="noreferrer" className="text-xs text-slate-300 underline hover:text-white">
                        {short(s.txSignature ?? "", 6)} ↗
                      </a>
                    )}
                    <span className="ml-auto text-[10px] text-slate-500">{(s.ms / 1000).toFixed(1)}s</span>
                  </div>
                  <p className="mt-1 break-words font-sans text-slate-300">{s.summary}</p>
                </li>
              );
            })}
          </ol>

          {replayDone && (
            <div className="anim-step-in line-think rounded-lg border border-[#2a3b5e] bg-[var(--navy-2)]/60 p-3">
              <p className="text-xs uppercase tracking-wide text-[var(--acc-think)]">Agent&apos;s conclusion</p>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{run.finalText}</p>
            </div>
          )}

          {replayDone && run.proposal && !execution && (
            <div className="anim-pop-in flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--acc-pay)]/40 bg-[var(--acc-pay)]/10 p-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-[var(--acc-pay)]">Trade proposal #{run.proposal.approvalId} · approval needed</p>
                <p className="font-mono text-sm">{run.proposal.description}</p>
              </div>
              <button
                onClick={() => setModalOpen(true)}
                disabled={executing}
                className="rounded-lg bg-[var(--acc-pay)] px-4 py-2 font-medium text-[var(--navy-1)] transition hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
              >
                {executing ? "Placing sandbox order…" : "Review & approve"}
              </button>
            </div>
          )}

          {execution && (
            <div
              className={`anim-pop-in rounded-lg border p-3 text-sm ${
                execution.mode === "sandbox" ? "border-[var(--acc-ok)]/40 bg-[var(--acc-ok)]/10" : "border-amber-500/40 bg-amber-500/10"
              }`}
            >
              {execution.mode === "sandbox" && (
                <>
                  <p className="font-medium text-[var(--acc-ok)]">Real Gemini sandbox order placed ✓</p>
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

      <section className="rounded-2xl border border-[var(--navy-line)] bg-[var(--navy-1)] p-4">
        <h2 className="mb-2 font-semibold">Spend ledger</h2>
        <div className="overflow-x-auto">
          <table className="w-full font-mono text-xs">
            <thead className="text-left text-slate-500">
              <tr><th className="py-1 pr-3">Time</th><th className="py-1 pr-3">Status</th><th className="py-1 pr-3 text-right">USDC</th><th className="py-1 pr-3">Resource</th><th className="py-1">Note</th></tr>
            </thead>
            <tbody className="text-slate-300">
              {ledger.map((r) => (
                <tr key={r.id} className="border-t border-[var(--navy-line)] align-top">
                  <td className="py-1 pr-3 whitespace-nowrap">{new Date(r.ts).toLocaleTimeString()}</td>
                  <td className={`py-1 pr-3 ${r.status === "paid" ? "text-[var(--acc-ok)]" : r.status === "blocked" || r.status === "failed" ? "text-[var(--acc-block)]" : "text-[var(--acc-pay)]"}`}>{r.status}</td>
                  <td className="py-1 pr-3 text-right tabular-nums">{Number(r.amount_usdc).toFixed(2)}</td>
                  <td className="py-1 pr-3 break-all">{r.resource_url.replace(/^https?:\/\/[^/]+/, "")}</td>
                  <td className="py-1 break-words text-slate-400">
                    {r.reason}
                    {r.tx_signature && r.status === "paid" && !r.resource_url.startsWith("gemini") && (
                      <> · <a className="text-[var(--acc-pay)] underline" target="_blank" rel="noreferrer" href={`https://explorer.solana.com/tx/${r.tx_signature}?cluster=devnet`}>{short(r.tx_signature, 5)}</a></>
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

      {celebrate && (
        <div className="anim-fade-in fixed inset-0 z-[55] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label="Sandbox order placed">
          <div className="anim-pop-in relative w-full max-w-sm rounded-2xl border border-[var(--acc-ok)]/40 bg-[var(--navy-1)] p-6 text-center shadow-2xl shadow-emerald-500/10">
            <Confetti pieces={celebrate.pieces} />
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--acc-ok)]/15 text-2xl text-[var(--acc-ok)]">✓</div>
            <p className="text-lg font-semibold text-[var(--acc-ok)]">Sandbox order placed</p>
            <p className="mt-1 text-sm text-slate-400">Real Gemini sandbox limit order, approved onchain.</p>
            <p className="mt-3 break-all rounded-lg bg-[var(--navy-2)] px-3 py-2 font-mono text-sm text-slate-100">{celebrate.orderId}</p>
            <button onClick={() => setCelebrate(null)} className="mt-4 rounded-lg border border-[#2a3b5e] px-4 py-2 text-sm text-slate-300 hover:bg-[#13213d]">
              Nice
            </button>
          </div>
        </div>
      )}

      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
