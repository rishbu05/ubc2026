// Allowance mark: a coin inside a budget ring (orange arc = allowance left, violet = the agent).
export default function Logo({ size = 96 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" role="img" aria-label="Allowance logo">
      <defs>
        <linearGradient id="al-coin" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffb36b" />
          <stop offset="1" stopColor="#ff6a1f" />
        </linearGradient>
        <linearGradient id="al-ring" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#a78bfa" />
          <stop offset="1" stopColor="#ff8a3d" />
        </linearGradient>
      </defs>
      <circle cx="48" cy="48" r="40" fill="none" stroke="#1e2d4a" strokeWidth="8" />
      <circle
        cx="48"
        cy="48"
        r="40"
        fill="none"
        stroke="url(#al-ring)"
        strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray="188 252"
        transform="rotate(-90 48 48)"
      />
      <circle cx="48" cy="48" r="26" fill="url(#al-coin)" />
      <circle cx="48" cy="48" r="20" fill="none" stroke="#0b1426" strokeOpacity="0.25" strokeWidth="2" />
      {/* stylised "A" */}
      <path d="M38 60 L48 34 L58 60 M42 51 H54" fill="none" stroke="#0b1426" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
