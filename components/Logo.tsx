"use client";
// Allowance mark: a coin inside a budget ring. Animated with Motion: the ring draws to ~75%
// (allowance left), the coin springs in, and the "A" strokes itself.
import { motion, useReducedMotion } from "motion/react";

export default function Logo({ size = 96 }: { size?: number }) {
  const reduce = useReducedMotion();
  const draw = (delay: number, to = 1) => ({
    initial: reduce ? { pathLength: to } : { pathLength: 0 },
    animate: { pathLength: to },
    transition: { duration: reduce ? 0 : 1.1, delay: reduce ? 0 : delay, ease: [0.2, 0.9, 0.3, 1] as const },
  });
  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 96 96"
      role="img"
      aria-label="Allowance logo"
      whileHover={reduce ? undefined : { rotate: -6, scale: 1.05 }}
      transition={{ type: "spring", stiffness: 260, damping: 18 }}
    >
      <circle cx="48" cy="48" r="40" fill="none" stroke="#1e2d4a" strokeWidth="8" />
      <motion.circle
        cx="48"
        cy="48"
        r="40"
        fill="none"
        stroke="#ff8a3d"
        strokeWidth="8"
        strokeLinecap="round"
        transform="rotate(-90 48 48)"
        {...draw(0.1, 0.75)}
      />
      <motion.circle
        cx="48"
        cy="48"
        r="26"
        fill="#ff8a3d"
        initial={reduce ? false : { scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 320, damping: 16, delay: reduce ? 0 : 0.35 }}
        style={{ transformOrigin: "48px 48px" }}
      />
      <motion.path
        d="M38 60 L48 34 L58 60 M42 51 H54"
        fill="none"
        stroke="#0b1426"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
        {...draw(0.7)}
      />
    </motion.svg>
  );
}
