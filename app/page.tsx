import Link from "next/link";
import DelegatePanel from "@/components/DelegatePanel";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-[var(--navy-0)] p-4 text-slate-100">
      <div className="text-center">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-[var(--acc-think)]">Solana devnet</p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight">
          allow<span className="text-[var(--acc-pay)]">ance</span>
        </h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-400">
          An AI agent with a spending allowance. It pays for data in USDC under a policy, and every trade needs your signature.
        </p>
        <Link
          href="/agent"
          className="mt-5 inline-flex items-center gap-2 rounded-lg bg-[var(--acc-pay)] px-5 py-2.5 font-medium text-[var(--navy-1)] shadow-lg shadow-orange-500/20 transition hover:brightness-110 active:scale-[0.98]"
        >
          Open the agent →
        </Link>
      </div>
      <div className="glow-card w-full max-w-md">
        <DelegatePanel />
      </div>
      <p className="max-w-md text-center text-xs text-slate-500">
        <span className="text-[var(--acc-pay)]">●</span> payments <span className="ml-3 text-[var(--acc-ok)]">●</span> approved{" "}
        <span className="ml-3 text-[var(--acc-block)]">●</span> blocked <span className="ml-3 text-[var(--acc-think)]">●</span> agent thinking
      </p>
    </main>
  );
}
