import DelegatePanel from "@/components/DelegatePanel";
import Hero, { Reveal } from "@/components/Hero";

export default function Home() {
  return (
    <main className="relative isolate flex min-h-screen flex-col items-center justify-center gap-12 overflow-hidden bg-[var(--navy-0)] px-4 py-16 text-slate-100">
      <Hero />
      <Reveal id="allowance">
        <DelegatePanel />
      </Reveal>
      <p className="text-xs text-slate-500">Solana devnet · Gemini sandbox · no real money moves</p>
    </main>
  );
}
