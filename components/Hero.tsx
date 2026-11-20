"use client";
// Home hero, animated with Motion (motion.dev): drifting glow, staggered wordmark, spring buttons.
import Link from "next/link";
import { motion, useReducedMotion, type Variants } from "motion/react";
import Logo from "./Logo";

const WORD = "Allowance";

const PILLS = [
  { dot: "var(--acc-pay)", text: "pays per call (x402)" },
  { dot: "var(--acc-block)", text: "blocks what breaks policy" },
  { dot: "var(--acc-ok)", text: "you approve every trade" },
  { dot: "var(--acc-think)", text: "Claude does the thinking" },
];

export default function Hero() {
  const reduce = useReducedMotion();
  const container: Variants = {
    hidden: {},
    show: { transition: { staggerChildren: reduce ? 0 : 0.045, delayChildren: reduce ? 0 : 0.25 } },
  };
  const letter: Variants = {
    hidden: reduce ? { opacity: 1 } : { opacity: 0, y: 28, filter: "blur(6px)" },
    show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { type: "spring", stiffness: 300, damping: 22 } },
  };
  const fadeUp = (delay: number) => ({
    initial: reduce ? false : { opacity: 0, y: 14 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.5, delay: reduce ? 0 : delay, ease: [0.2, 0.9, 0.3, 1] as const },
  });
  const press = reduce ? {} : { whileHover: { scale: 1.04, y: -1 }, whileTap: { scale: 0.97 } };

  return (
    <section className="relative flex flex-col items-center text-center">
      {/* drifting background glow */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -top-48 left-1/2 -z-10 h-[520px] w-[900px] -translate-x-1/2 rounded-full blur-3xl"
        style={{ background: "radial-gradient(closest-side, rgb(167 139 250 / 0.35), transparent)" }}
        animate={reduce ? undefined : { x: [-40, 40, -40], opacity: [0.55, 0.8, 0.55] }}
        transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -top-24 left-1/2 -z-10 h-[420px] w-[700px] -translate-x-1/3 rounded-full blur-3xl"
        style={{ background: "radial-gradient(closest-side, rgb(255 138 61 / 0.28), transparent)" }}
        animate={reduce ? undefined : { x: [30, -50, 30], y: [0, 20, 0] }}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
      />

      <Logo size={120} />

      <motion.h1
        aria-label={WORD}
        className="mt-6 flex text-6xl font-bold tracking-tight sm:text-8xl"
        variants={container}
        initial="hidden"
        animate="show"
      >
        {WORD.split("").map((ch, i) => (
          <motion.span
            key={i}
            aria-hidden
            variants={letter}
            className="bg-gradient-to-b from-white to-orange-200 bg-clip-text text-transparent last:to-[var(--acc-pay)]"
          >
            {ch}
          </motion.span>
        ))}
      </motion.h1>

      <motion.p {...fadeUp(0.75)} className="mt-4 max-w-xl text-lg text-slate-300 sm:text-xl">
        Give an AI agent a budget, not your wallet. It pays for data in USDC on Solana, stays inside the limits you set, and
        every trade waits for your signature.
      </motion.p>

      <motion.div {...fadeUp(0.95)} className="mt-8 flex flex-wrap justify-center gap-3">
        <motion.div {...press}>
          <Link
            href="/agent"
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--acc-pay)] px-6 py-3 text-base font-semibold text-[var(--navy-1)] shadow-lg shadow-orange-500/25"
          >
            Watch the agent work →
          </Link>
        </motion.div>
        <motion.div {...press}>
          <a href="#allowance" className="inline-flex items-center rounded-xl border border-[#2a3b5e] px-6 py-3 text-base text-slate-200 hover:bg-[#13213d]">
            Set its allowance
          </a>
        </motion.div>
      </motion.div>

      <motion.ul
        className="mt-8 flex flex-wrap justify-center gap-2 font-mono text-xs text-slate-300"
        initial="hidden"
        animate="show"
        variants={{ hidden: {}, show: { transition: { staggerChildren: reduce ? 0 : 0.08, delayChildren: reduce ? 0 : 1.15 } } }}
      >
        {PILLS.map((p) => (
          <motion.li
            key={p.text}
            variants={{ hidden: reduce ? { opacity: 1 } : { opacity: 0, y: 8, scale: 0.95 }, show: { opacity: 1, y: 0, scale: 1 } }}
            whileHover={reduce ? undefined : { y: -2 }}
            className="rounded-full border border-[var(--navy-line)] bg-[var(--navy-1)]/80 px-3 py-1.5 backdrop-blur"
          >
            <span style={{ color: p.dot }}>●</span> {p.text}
          </motion.li>
        ))}
      </motion.ul>
    </section>
  );
}

/** Fades the allowance panel in when it scrolls into view. */
export function Reveal({ children, id }: { children: React.ReactNode; id?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      id={id}
      className="glow-card relative w-full max-w-md"
      initial={reduce ? false : { opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.5, ease: [0.2, 0.9, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}
