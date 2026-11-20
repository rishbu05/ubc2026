"use client";
// Bottom-right toast stack. Kinds map to the accent system:
// pay = orange, ok = green, block = red (shakes), approval = orange, think = violet.
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUpRight, Ban, BrainCircuit, CircleCheck, CircleDollarSign, ShieldAlert, X, type LucideIcon } from "lucide-react";
import Icon from "./Icon";

export type ToastKind = "pay" | "ok" | "block" | "approval" | "think";

export interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  detail?: string;
  href?: string;
  leaving?: boolean;
}

const STYLE: Record<ToastKind, { ring: string; icon: LucideIcon; label: string }> = {
  pay: { ring: "border-[var(--acc-pay)]/50", icon: CircleDollarSign, label: "text-[var(--acc-pay)]" },
  approval: { ring: "border-[var(--acc-pay)]/50", icon: ShieldAlert, label: "text-[var(--acc-pay)]" },
  ok: { ring: "border-[var(--acc-ok)]/50", icon: CircleCheck, label: "text-[var(--acc-ok)]" },
  block: { ring: "border-[var(--acc-block)]/60", icon: Ban, label: "text-[var(--acc-block)]" },
  think: { ring: "border-[var(--acc-think)]/50", icon: BrainCircuit, label: "text-[var(--acc-think)]" },
};

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());

  const later = useCallback((fn: () => void, ms: number) => {
    const t = setTimeout(() => {
      timers.current.delete(t);
      fn();
    }, ms);
    timers.current.add(t);
  }, []);

  const dismiss = useCallback(
    (id: number) => {
      setToasts((ts) => ts.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
      later(() => setToasts((ts) => ts.filter((t) => t.id !== id)), 220);
    },
    [later],
  );

  const push = useCallback(
    (t: Omit<Toast, "id">) => {
      const id = nextId.current++;
      setToasts((ts) => [...ts.slice(-4), { ...t, id }]);
      later(() => dismiss(id), t.kind === "block" ? 7000 : 4500);
    },
    [dismiss, later],
  );

  useEffect(() => {
    const set = timers.current;
    return () => set.forEach(clearTimeout);
  }, []);

  return { toasts, push, dismiss };
}

export function ToastStack({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div
      className="pointer-events-none fixed inset-x-4 bottom-4 z-[60] flex flex-col items-end gap-2 sm:inset-x-auto sm:right-4"
      aria-live="polite"
      role="status"
    >
      {toasts.map((t) => {
        const s = STYLE[t.kind];
        const anim = t.leaving ? "anim-toast-out" : t.kind === "block" ? "anim-shake" : "anim-toast-in";
        return (
          <div
            key={t.id}
            className={`pointer-events-auto w-full max-w-sm rounded-xl border ${s.ring} bg-[var(--navy-1)]/95 px-4 py-3 shadow-2xl shadow-black/40 backdrop-blur ${anim}`}
          >
            <div className="flex items-start gap-3">
              <Icon as={s.icon} className={`mt-1 ${s.label}`} />
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-medium ${s.label}`}>{t.title}</p>
                {t.detail && <p className="mt-1 break-words font-mono text-xs text-slate-400">{t.detail}</p>}
                {t.href && (
                  <a href={t.href} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 font-mono text-xs text-slate-200 underline">
                    View transaction on Solana Explorer <Icon as={ArrowUpRight} />
                  </a>
                )}
              </div>
              <button onClick={() => onDismiss(t.id)} className="text-slate-500 hover:text-slate-200" aria-label="Dismiss notification">
                <Icon as={X} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
