"use client";
// Human approval for an agent action, via Solana Pay.
//   - QR of approvalLink(id) to scan with Phantom mobile (transaction request -> memo tx)
//   - "Sign in browser" fallback using the connected Phantom extension
//   - polls /api/approve/[id]/check every 2s; calls onApproved once the signature is verified onchain
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { Transaction } from "@solana/web3.js";
import { approvalLink, approvalMemo } from "@/lib/solanaPay";
import { CircleCheck } from "lucide-react";
import Icon from "./Icon";

export interface ApprovalResult {
  signature: string;
  approver: string;
  explorerUrl: string;
}

export interface ApprovalModalProps {
  approvalId: number;
  amountUsdc: number | string | null;
  description: string;
  onApproved: (result: ApprovalResult) => void;
  onRejected: () => void;
}

const POLL_MS = 2000;

type Phase =
  | { kind: "waiting" }
  | { kind: "signing" }
  | { kind: "submitted"; signature: string }
  | { kind: "approved"; result: ApprovalResult }
  | { kind: "error"; message: string };

function base64ToBytes(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

function short(s: string, n = 6) {
  return s.length > 2 * n + 1 ? `${s.slice(0, n)}…${s.slice(-n)}` : s;
}

export default function ApprovalModal({
  approvalId,
  amountUsdc,
  description,
  onApproved,
  onRejected,
}: ApprovalModalProps) {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const [phase, setPhase] = useState<Phase>({ kind: "waiting" });
  const [checkNote, setCheckNote] = useState<string | null>(null);
  const qrRef = useRef<HTMLDivElement>(null);

  const link = approvalLink(approvalId);
  const memo = approvalMemo({ id: approvalId, description });
  const done = phase.kind === "approved";

  // QR code (client-only lib, loaded lazily so it never runs during SSR).
  useEffect(() => {
    let cancelled = false;
    const el = qrRef.current;
    import("@solana/pay").then(({ createQR }) => {
      if (cancelled || !el) return;
      el.innerHTML = "";
      // Dark modules on white: the most reliable contrast for phone scanners.
      createQR(link, 232, "#ffffff", "#0b1426").append(el);
    });
    return () => {
      cancelled = true;
      if (el) el.innerHTML = "";
    };
  }, [link]);

  const handleApproved = useEffectEvent((result: ApprovalResult) => onApproved(result));

  // Poll the onchain checker until approved (or a definitive invalid result).
  useEffect(() => {
    if (done) return;
    let stopped = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/approve/${approvalId}/check`, { cache: "no-store" });
        const body = await res.json();
        if (stopped) return;
        if (body.status === "approved") {
          stopped = true;
          const result = { signature: body.signature, approver: body.approver, explorerUrl: body.explorerUrl };
          setPhase({ kind: "approved", result });
          handleApproved(result);
        } else if (body.status === "invalid") {
          setPhase({ kind: "error", message: body.reason ?? "Approval is invalid" });
        } else if (body.error) {
          setCheckNote(body.error);
        } else {
          setCheckNote(null);
        }
      } catch {
        if (!stopped) setCheckNote("Couldn’t reach the server. Trying again…");
      }
    };
    const id = setInterval(tick, POLL_MS);
    tick();
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [approvalId, done]);

  async function signInBrowser() {
    if (!publicKey) return;
    setPhase({ kind: "signing" });
    try {
      const res = await fetch(`/api/approve/${approvalId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account: publicKey.toBase58() }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
      const tx = Transaction.from(base64ToBytes(body.transaction));
      const signature = await sendTransaction(tx, connection);
      setPhase({ kind: "submitted", signature }); // polling confirms it onchain
    } catch (e) {
      setPhase({ kind: "error", message: (e as Error).message });
    }
  }

  const amountLabel =
    amountUsdc === null || amountUsdc === "" ? "n/a" : `${Number(amountUsdc).toFixed(2)} USDC`;

  return (
    <div
      className="anim-fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="approval-title"
    >
      <div className="anim-modal-in w-full max-w-md rounded-2xl border border-[var(--acc-pay)]/30 bg-[#0b1426] text-slate-100 shadow-2xl shadow-orange-500/10">
        <div className="flex items-center justify-between border-b border-[#1e2d4a] px-6 py-4">
          <h2 id="approval-title" className="text-lg font-semibold text-white">
            Approve agent request
          </h2>
          <span className="rounded-full bg-orange-500/15 px-3 py-1 font-mono text-xs text-orange-400">
            #{approvalId}
          </span>
        </div>

        <div className="space-y-4 px-6 py-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">Amount</p>
            <p className="font-mono text-3xl font-semibold text-[var(--acc-pay)] tabular-nums">{amountLabel}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">The agent wants to</p>
            <p className="mt-1 text-sm leading-relaxed">{description}</p>
          </div>

          <dl className="space-y-1 rounded-lg bg-[#0f1b33] p-3 font-mono text-xs text-slate-300">
            <div className="flex gap-2">
              <dt className="w-14 shrink-0 text-slate-500">memo</dt>
              <dd className="break-all">{memo}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-14 shrink-0 text-slate-500">link</dt>
              <dd className="break-all">{link}</dd>
            </div>
          </dl>

          {phase.kind === "approved" ? (
            <div className="anim-pop-in rounded-lg border border-[var(--acc-ok)]/40 bg-[var(--acc-ok)]/10 p-3 text-sm">
              <p className="flex items-center gap-2 font-medium text-[var(--acc-ok)]"><Icon as={CircleCheck} /> Approved onchain</p>
              <p className="mt-1 font-mono text-xs text-slate-300">
                by {short(phase.result.approver)} ·{" "}
                <a href={phase.result.explorerUrl} target="_blank" rel="noreferrer" className="text-orange-400 underline">
                  {short(phase.result.signature, 8)}
                </a>
              </p>
            </div>
          ) : (
            <>
              <div className="flex flex-col items-center gap-2">
                <div className="anim-qr-pulse relative overflow-hidden rounded-xl bg-white p-2 ring-2 ring-[var(--acc-pay)]/70" style={{ width: 248, height: 248 }}>
                  <span className="absolute inset-0 flex items-center justify-center text-xs text-slate-500">Generating QR code…</span>
                  <div ref={qrRef} className="relative" />
                </div>
                <p className="text-xs text-slate-400">Scan with Phantom mobile (Devnet)</p>
              </div>

              <div className="flex items-center gap-3 text-xs text-slate-500">
                <span className="h-px flex-1 bg-[#1e2d4a]" /> or <span className="h-px flex-1 bg-[#1e2d4a]" />
              </div>

              {publicKey ? (
                <button
                  onClick={signInBrowser}
                  disabled={phase.kind === "signing" || phase.kind === "submitted"}
                  className="w-full rounded-lg bg-[var(--acc-pay)] px-4 py-3 font-medium text-[#0b1426] transition hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
                >
                  {phase.kind === "signing" ? "Confirm in Phantom…" : `Approve with Phantom extension (${short(publicKey.toBase58(), 4)})`}
                </button>
              ) : (
                <div className="flex justify-center">
                  <WalletMultiButton />
                </div>
              )}

              <p className="font-mono text-xs text-slate-400" aria-live="polite">
                {phase.kind === "submitted"
                  ? `Submitted ${short(phase.signature, 8)}. Confirming onchain…`
                  : phase.kind === "error"
                    ? <span className="text-[var(--acc-block)]">{phase.message}</span>
                    : checkNote
                      ? <span className="text-amber-400">{checkNote}</span>
                      : "Waiting for your signature. This updates on its own."}
              </p>
            </>
          )}
        </div>

        {!done && (
          <div className="flex justify-end gap-2 border-t border-[#1e2d4a] px-6 py-3">
            <button
              onClick={onRejected}
              className="rounded-lg border border-[#2a3b5e] px-4 py-2 text-sm text-slate-300 hover:bg-[#13213d]"
            >
              Don’t approve
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
