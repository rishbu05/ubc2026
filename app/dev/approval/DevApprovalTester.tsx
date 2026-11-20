"use client";
import { useState, useTransition } from "react";
import ApprovalModal, { type ApprovalResult } from "@/components/ApprovalModal";
import { createTestApproval } from "./actions";

type Active = { id: number; amountUsdc: number; description: string };

export default function DevApprovalTester() {
  const [description, setDescription] = useState("Buy 10 YES on GEMI-FED261211-HIKE25 @ 0.40");
  const [amount, setAmount] = useState("4.00");
  const [active, setActive] = useState<Active | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const add = (line: string) => setLog((l) => [`${new Date().toLocaleTimeString()}  ${line}`, ...l]);

  function create() {
    setError(null);
    startTransition(async () => {
      const r = await createTestApproval({ description, amountUsdc: Number(amount) });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      add(`created approval #${r.id}`);
      setActive({ id: r.id, amountUsdc: r.amountUsdc, description: r.description });
    });
  }

  return (
    <div className="space-y-4 rounded-2xl border border-[#1e2d4a] bg-[#0b1426] p-5">
      <label className="block space-y-1">
        <span className="text-xs uppercase tracking-wide text-slate-400">What the agent wants to do</span>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={150}
          className="w-full rounded-lg border border-[#2a3b5e] bg-[#0f1b33] px-3 py-2 text-sm"
        />
      </label>
      <label className="block space-y-1">
        <span className="text-xs uppercase tracking-wide text-slate-400">Amount (USDC)</span>
        <input
          type="number"
          min="0.01"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-32 rounded-lg border border-[#2a3b5e] bg-[#0f1b33] px-3 py-2 font-mono text-sm tabular-nums"
        />
      </label>
      <button
        onClick={create}
        disabled={pending}
        className="w-full rounded-lg bg-orange-500 px-4 py-2.5 font-medium text-[#0b1426] hover:bg-orange-400 disabled:opacity-50"
      >
        {pending ? "Creating…" : "Create test approval"}
      </button>
      {error && <p className="break-words text-sm text-red-400">{error}</p>}
      {log.length > 0 && (
        <pre className="max-h-48 overflow-auto rounded-lg bg-[#0f1b33] p-3 font-mono text-xs text-slate-300">
          {log.join("\n")}
        </pre>
      )}

      {active && (
        <ApprovalModal
          approvalId={active.id}
          amountUsdc={active.amountUsdc}
          description={active.description}
          onApproved={(r: ApprovalResult) => {
            add(`#${active.id} approved by ${r.approver} · ${r.explorerUrl}`);
            setTimeout(() => setActive(null), 1500);
          }}
          onRejected={() => {
            add(`#${active.id} rejected (closed)`);
            setActive(null);
          }}
        />
      )}
    </div>
  );
}
