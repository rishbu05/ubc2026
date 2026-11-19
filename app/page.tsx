import DelegatePanel from "@/components/DelegatePanel";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-6 p-4">
      <h1 className="text-2xl font-semibold">allowance</h1>
      <p className="text-sm opacity-70">Solana devnet</p>
      <DelegatePanel />
    </main>
  );
}
