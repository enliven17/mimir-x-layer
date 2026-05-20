"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

// FIFA World Cup 2026 — kickoff: June 11, 2026 (Mexico City, Estadio Azteca).
const KICKOFF_UTC = Date.UTC(2026, 5, 11, 20, 0, 0); // 2026-06-11 20:00 UTC

type Remaining = { d: number; h: number; m: number; s: number; done: boolean };

function diffToKickoff(now: number): Remaining {
  const delta = KICKOFF_UTC - now;
  if (delta <= 0) return { d: 0, h: 0, m: 0, s: 0, done: true };
  const s = Math.floor(delta / 1000);
  return {
    d: Math.floor(s / 86400),
    h: Math.floor((s % 86400) / 3600),
    m: Math.floor((s % 3600) / 60),
    s: s % 60,
    done: false,
  };
}

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

function CountdownUnit({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center leading-none">
      <span className="font-display text-[15px] font-bold tabular-nums text-white sm:text-[17px]">
        {pad(value)}
      </span>
      <span className="mt-0.5 font-mono text-[8px] font-bold uppercase tracking-[0.18em] text-white/70 sm:text-[9px]">
        {label}
      </span>
    </div>
  );
}

export default function WorldCupBanner() {
  const reducedMotion = useReducedMotion();
  const [remaining, setRemaining] = useState<Remaining | null>(null);

  useEffect(() => {
    setRemaining(diffToKickoff(Date.now()));
    const id = window.setInterval(() => {
      setRemaining(diffToKickoff(Date.now()));
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="relative isolate w-full overflow-hidden">
      {/* Tricolor flag stripe */}
      <div className="wc-flag-stripe h-[3px] w-full" aria-hidden />

      <motion.div
        initial={reducedMotion ? false : { y: -8, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.45, ease: "easeOut" }}
        className="relative bg-gradient-to-r from-wc-navy via-wc-teal to-wc-green"
      >
        {/* Diagonal sheen sweep */}
        {!reducedMotion && (
          <div
            className="pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/15 to-transparent animate-sweep-shine"
            aria-hidden
          />
        )}

        {/* Subtle pitch stripes overlay */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.08]"
          aria-hidden
          style={{
            backgroundImage:
              "repeating-linear-gradient(90deg, rgba(255,255,255,0.4) 0px, rgba(255,255,255,0.4) 1px, transparent 1px, transparent 80px)",
          }}
        />

        <div className="relative mx-auto flex max-w-[1100px] flex-wrap items-center justify-between gap-3 px-4 py-2 sm:flex-nowrap sm:px-6 sm:py-2.5">
          {/* Left: trophy + edition badge */}
          <div className="flex items-center gap-2.5 sm:gap-3">
            <span
              className={`inline-block text-[18px] leading-none sm:text-[20px] ${
                reducedMotion ? "" : "animate-trophy-shine"
              }`}
              aria-hidden
            >
              🏆
            </span>
            <div className="flex items-center gap-2">
              <span className="font-display text-[11px] font-bold uppercase tracking-[0.22em] text-white sm:text-[12px]">
                World Cup Edition
              </span>
              <span className="hidden rounded-sm border border-white/25 bg-white/10 px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-white/90 sm:inline-block">
                2026
              </span>
            </div>
          </div>

          {/* Right: countdown */}
          <div className="flex items-center gap-3 sm:gap-4">
            <span className="hidden font-mono text-[9px] font-bold uppercase tracking-[0.22em] text-white/75 sm:inline-block">
              Kick&#8209;off in
            </span>
            {remaining && !remaining.done ? (
              <div className="flex items-center gap-2 sm:gap-3">
                <CountdownUnit value={remaining.d} label="Days" />
                <span className="font-display text-[14px] font-bold text-white/40">:</span>
                <CountdownUnit value={remaining.h} label="Hrs" />
                <span className="font-display text-[14px] font-bold text-white/40">:</span>
                <CountdownUnit value={remaining.m} label="Min" />
                <span className="hidden font-display text-[14px] font-bold text-white/40 sm:inline">:</span>
                <span className="hidden sm:inline-flex">
                  <CountdownUnit value={remaining.s} label="Sec" />
                </span>
              </div>
            ) : remaining?.done ? (
              <span className="font-display text-[12px] font-bold uppercase tracking-[0.18em] text-white sm:text-[13px]">
                Kick&#8209;off · Live now
              </span>
            ) : (
              <div className="h-[28px] w-[140px] animate-pulse rounded bg-white/10" aria-hidden />
            )}

            {/* Live dot */}
            <span className="relative inline-flex h-2 w-2" aria-hidden>
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-wc-gold opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-wc-gold" />
            </span>
          </div>
        </div>
      </motion.div>

      {/* Bottom tricolor */}
      <div className="wc-flag-stripe h-[3px] w-full" aria-hidden />
    </div>
  );
}
