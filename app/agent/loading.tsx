// Shown while /agent loads market data, the chart and the ledger (about 1-3 s).
export default function Loading() {
  const bar = "animate-pulse rounded-lg bg-[var(--navy-2)]";
  return (
    <main className="min-h-screen bg-[var(--navy-0)] px-6 py-12 text-slate-100">
      <div className="mx-auto max-w-5xl space-y-8" aria-busy="true" aria-label="Loading the agent dashboard">
        <div className="space-y-3">
          <div className={`${bar} h-3 w-28`} />
          <div className={`${bar} h-9 w-80`} />
          <div className={`${bar} h-4 w-[28rem] max-w-full`} />
        </div>
        <div className={`${bar} h-24`} />
        <div className="rounded-2xl border border-[var(--navy-line)] bg-[var(--navy-1)] p-6">
          <div className={`${bar} h-5 w-56`} />
          <div className={`${bar} mt-4 h-56`} />
          <p className="mt-3 text-xs text-slate-500">Loading live prices from Gemini…</p>
        </div>
        <div className={`${bar} h-36`} />
      </div>
    </main>
  );
}
