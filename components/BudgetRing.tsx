"use client";
// Remaining daily budget as a ring that ticks down (CSS transition) as payments land.

export default function BudgetRing({ spent, cap }: { spent: number; cap: number }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const remaining = Math.max(0, cap - spent);
  const frac = cap > 0 ? remaining / cap : 0;
  const color = frac < 0.2 ? "var(--acc-block)" : "var(--acc-pay)";
  return (
    <div className="flex items-center gap-3" role="img" aria-label={`Daily budget: $${remaining.toFixed(2)} of $${cap.toFixed(2)} left`}>
      <svg width="84" height="84" viewBox="0 0 84 84" className="-rotate-90">
        <circle cx="42" cy="42" r={r} fill="none" stroke="var(--navy-line)" strokeWidth="8" />
        <circle
          cx="42"
          cy="42"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - frac)}
          style={{ transition: "stroke-dashoffset 600ms cubic-bezier(.2,.9,.3,1), stroke 300ms" }}
        />
      </svg>
      <div>
        <div className="text-xs uppercase tracking-wide text-slate-500">Budget left today</div>
        <div className="font-mono text-xl tabular-nums text-slate-100" style={{ transition: "color 300ms" }}>
          ${remaining.toFixed(2)}
        </div>
        <div className="font-mono text-xs text-slate-500">of ${cap.toFixed(2)} · spent ${spent.toFixed(2)}</div>
      </div>
    </div>
  );
}
