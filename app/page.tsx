import DelegatePanel from "@/components/DelegatePanel";
import Hero, { Reveal } from "@/components/Hero";

export default function Home() {
  return (
    <main className="min-h-screen bg-[var(--navy-0)] text-slate-100">
      <div className="mx-auto grid min-h-screen max-w-6xl grid-cols-1 content-center gap-16 px-6 py-24 lg:grid-cols-[1.25fr_1fr] lg:items-center">
        <Hero />
        <Reveal id="allowance">
          <DelegatePanel />
        </Reveal>
        <p className="text-xs text-slate-500 lg:col-span-2">Solana devnet · Gemini sandbox · no real money moves</p>
      </div>
    </main>
  );
}
