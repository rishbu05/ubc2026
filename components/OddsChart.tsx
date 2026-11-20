"use client";
// Implied probability over time for up to 4 contracts (one 0-100% axis).
// Palette: dataviz reference categorical, DARK steps in fixed order, validated on #0b1426
// (all checks pass; worst adjacent CVD ΔE 8.4). Identity is never color-only: legend + end labels.
import { useMemo, useRef, useState } from "react";

export interface ChartSeries {
  symbol: string;
  label: string;
  points: { t: number; v: number; src: string }[];
}

const COLORS = ["#3987e5", "#d95926", "#199e70", "#c98500"]; // slots 1-4, fixed order
const W = 640, H = 260, PAD = { l: 40, r: 112, t: 12, b: 26 };

const pct = (v: number) => `${Math.round(v * 100)}%`;
const hhmm = (t: number) => new Date(t).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

export default function OddsChart({ series, title }: { series: ChartSeries[]; title: string }) {
  const [hoverT, setHoverT] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);

  const s = series.slice(0, 4);
  const { t0, t1 } = useMemo(() => {
    const ts = s.flatMap((x) => x.points.map((p) => p.t));
    return { t0: Math.min(...ts), t1: Math.max(...ts) };
  }, [s]);

  if (s.length === 0 || !Number.isFinite(t0)) {
    return <p className="text-sm text-slate-400">No price history yet for this market.</p>;
  }

  const x = (t: number) => PAD.l + ((t - t0) / Math.max(1, t1 - t0)) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - v) * (H - PAD.t - PAD.b);
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const xTicks = Array.from({ length: 4 }, (_, i) => t0 + ((t1 - t0) * i) / 3);

  const nearest = (pts: ChartSeries["points"], t: number) =>
    pts.reduce((best, p) => (Math.abs(p.t - t) < Math.abs(best.t - t) ? p : best), pts[0]);

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const r = svgRef.current!.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const t = t0 + ((px - PAD.l) / (W - PAD.l - PAD.r)) * (t1 - t0);
    setHoverT(Math.min(t1, Math.max(t0, t)));
  }

  // Direct end labels, nudged apart so they never collide.
  const ends = s
    .map((ser, i) => ({ i, label: ser.label, v: ser.points[ser.points.length - 1].v }))
    .sort((a, b) => b.v - a.v);
  let prevY = -Infinity;
  const endY = new Map<number, number>();
  for (const e of ends) {
    const yy = Math.max(y(e.v), prevY + 14);
    endY.set(e.i, yy);
    prevY = yy;
  }

  return (
    <figure className="space-y-2">
      <figcaption className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium text-slate-200">{title}</span>
        <button onClick={() => setShowTable((v) => !v)} className="text-xs text-slate-400 underline hover:text-slate-200">
          {showTable ? "Show chart" : "Show table"}
        </button>
      </figcaption>

      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-300" aria-label="Legend">
        {s.map((ser, i) => (
          <li key={ser.symbol} className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-4 rounded" style={{ background: COLORS[i] }} />
            {ser.label}
          </li>
        ))}
      </ul>

      {showTable ? (
        <div className="max-h-64 overflow-auto rounded-lg border border-[#1e2d4a]">
          <table className="w-full font-mono text-xs">
            <thead className="sticky top-0 bg-[#0f1b33] text-slate-400">
              <tr><th className="px-2 py-1 text-left">Contract</th><th className="px-2 py-1 text-left">Time</th><th className="px-2 py-1 text-right">Prob.</th><th className="px-2 py-1 text-left">Source</th></tr>
            </thead>
            <tbody className="text-slate-300">
              {s.flatMap((ser) => ser.points.slice(-12).map((p) => (
                <tr key={`${ser.symbol}-${p.t}-${p.src}`} className="border-t border-[#1e2d4a]">
                  <td className="px-2 py-1">{ser.label}</td><td className="px-2 py-1">{hhmm(p.t)}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{pct(p.v)}</td><td className="px-2 py-1">{p.src}</td>
                </tr>
              )))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="relative">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${W} ${H}`}
            className="h-auto w-full touch-none"
            role="img"
            aria-label={`${title}: implied probability over time for ${s.map((x) => x.label).join(", ")}`}
            onPointerMove={onMove}
            onPointerLeave={() => setHoverT(null)}
          >
            {ticks.map((v) => (
              <g key={v}>
                <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="#1e2d4a" strokeWidth={1} />
                <text x={PAD.l - 6} y={y(v) + 4} textAnchor="end" className="fill-slate-500 text-[10px]">{pct(v)}</text>
              </g>
            ))}
            {xTicks.map((t, i) => (
              <text key={i} x={x(t)} y={H - 8} textAnchor={i === 0 ? "start" : i === 3 ? "end" : "middle"} className="fill-slate-500 text-[10px]">
                {hhmm(t)}
              </text>
            ))}
            {s.map((ser, i) => (
              <g key={ser.symbol}>
                <polyline
                  fill="none"
                  stroke={COLORS[i]}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  points={ser.points.map((p) => `${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ")}
                />
                {/* live point: 8px marker with a 2px surface ring */}
                <circle cx={x(ser.points[ser.points.length - 1].t)} cy={y(ser.points[ser.points.length - 1].v)} r={4} fill={COLORS[i]} stroke="#0b1426" strokeWidth={2} />
                <circle cx={W - PAD.r + 10} cy={endY.get(i)! - 3} r={3} fill={COLORS[i]} />
                <text x={W - PAD.r + 17} y={endY.get(i)!} className="fill-slate-300 text-[10px]">
                  {ser.label.replace(" or above", "+")} {pct(ser.points[ser.points.length - 1].v)}
                </text>
              </g>
            ))}
            {hoverT !== null && (
              <g pointerEvents="none">
                <line x1={x(hoverT)} x2={x(hoverT)} y1={PAD.t} y2={H - PAD.b} stroke="#64748b" strokeWidth={1} strokeDasharray="3 3" />
                {s.map((ser, i) => {
                  const p = nearest(ser.points, hoverT);
                  return <circle key={ser.symbol} cx={x(p.t)} cy={y(p.v)} r={4} fill={COLORS[i]} stroke="#0b1426" strokeWidth={2} />;
                })}
              </g>
            )}
          </svg>
          {hoverT !== null && (
            <div
              className="pointer-events-none absolute top-2 rounded-md border border-[#2a3b5e] bg-[#0f1b33]/95 px-2 py-1.5 font-mono text-[11px] text-slate-200 shadow-lg"
              style={{ left: `${Math.min(70, (x(hoverT) / W) * 100)}%` }}
            >
              <div className="mb-0.5 text-slate-400">{hhmm(hoverT)}</div>
              {s.map((ser, i) => {
                const p = nearest(ser.points, hoverT);
                return (
                  <div key={ser.symbol} className="flex items-center gap-1.5">
                    <span className="inline-block h-2 w-2 rounded-full" style={{ background: COLORS[i] }} />
                    <span className="text-slate-300">{ser.label}</span>
                    <span className="ml-auto pl-2 tabular-nums">{pct(p.v)}</span>
                    <span className="text-slate-500">{p.src}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
      <p className="text-[11px] text-slate-500">
        Gemini production data. History: 15-min candles (last trade) and recorder snapshots; latest point: live order-book mid.
      </p>
    </figure>
  );
}
