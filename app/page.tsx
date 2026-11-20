import Link from "next/link";
import DelegatePanel from "@/components/DelegatePanel";
import Logo from "@/components/Logo";

export default function Home() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center gap-10 overflow-hidden bg-[var(--navy-0)] px-4 py-16 text-slate-100">
      {/* background glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[900px] -translate-x-1/2 rounded-full opacity-60 blur-3xl"
        style={{
          background:
            "radial-gradient(closest-side, rgb(167 139 250 / 0.35), transparent), radial-gradient(closest-side, rgb(255 138 61 / 0.25), transparent)",
        }}
      />

      <section className="anim-pop-in relative flex flex-col items-center text-center">
        <Logo size={112} />
        <h1 className="mt-6 bg-gradient-to-r from-white via-orange-100 to-[var(--acc-pay)] bg-clip-text text-6xl font-bold tracking-tight text-transparent sm:text-8xl">
          Allowance
        </h1>
        <p className="mt-4 max-w-xl text-lg text-slate-300 sm:text-xl">
          Give an AI agent a budget, not your wallet. It pays for data in USDC on Solana, stays inside the limits you set,
          and every trade waits for your signature.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            href="/agent"
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--acc-pay)] px-6 py-3 text-base font-semibold text-[var(--navy-1)] shadow-lg shadow-orange-500/25 transition hover:brightness-110 active:scale-[0.98]"
          >
            Watch the agent work →
          </Link>
          <a
            href="#allowance"
            className="inline-flex items-center rounded-xl border border-[#2a3b5e] px-6 py-3 text-base text-slate-200 transition hover:bg-[#13213d]"
          >
            Set its allowance
          </a>
        </div>
        <div className="mt-8 flex flex-wrap justify-center gap-x-5 gap-y-2 font-mono text-xs text-slate-400">
          <span><span className="text-[var(--acc-pay)]">●</span> pays per call (x402)</span>
          <span><span className="text-[var(--acc-block)]">●</span> blocks what breaks policy</span>
          <span><span className="text-[var(--acc-ok)]">●</span> you approve every trade</span>
          <span><span className="text-[var(--acc-think)]">●</span> Claude does the thinking</span>
        </div>
      </section>

      <div id="allowance" className="glow-card relative w-full max-w-md">
        <DelegatePanel />
      </div>

      <p className="relative text-xs text-slate-500">Solana devnet · Gemini sandbox · no real money moves</p>
    </main>
  );
}
