// /dev/approval: try ApprovalModal end to end with a real test approval.
// Enabled only when ENABLE_DEV_PAGES=true (404 otherwise).
import { notFound } from "next/navigation";
import DevApprovalTester from "./DevApprovalTester";

export const dynamic = "force-dynamic";

export default function DevApprovalPage() {
  if (process.env.ENABLE_DEV_PAGES !== "true") notFound();
  return (
    <main className="min-h-screen bg-[#060c18] p-4 text-slate-100">
      <div className="mx-auto max-w-md space-y-4 pt-10">
        <h1 className="text-xl font-semibold">Approval modal test</h1>
        <p className="text-sm text-slate-400">
          Creates a real pending approval (prefixed <code className="font-mono">TEST:</code>), then opens the
          modal. Approve by scanning the QR with Phantom mobile or signing with the Phantom extension (Devnet).
        </p>
        <DevApprovalTester />
      </div>
    </main>
  );
}
