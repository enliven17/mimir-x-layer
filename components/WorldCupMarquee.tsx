"use client";

import { useReducedMotion } from "framer-motion";
import { Ball } from "./WorldCupAccents";

const PHRASES = [
  "World Cup Edition 2026",
  "Settle every match debate on-chain",
  "Kick off · Lock the stake · Win the pot",
  "From group stage to the final whistle",
  "AI referee. On-chain settlement.",
  "Don't argue — predict, prove, profit",
];

export default function WorldCupMarquee() {
  const reducedMotion = useReducedMotion();
  // Duplicate phrases so the animation can loop seamlessly with -50% translation.
  const lane = [...PHRASES, ...PHRASES];

  return (
    <div className="wc-marquee-mask relative isolate w-full overflow-hidden border-y border-pv-fuch/20 bg-gradient-to-r from-wc-navy via-wc-teal to-wc-navy py-2.5">
      <div
        className={`flex w-max items-center gap-8 whitespace-nowrap ${
          reducedMotion ? "" : "animate-marquee"
        }`}
      >
        {lane.map((phrase, i) => (
          <span key={i} className="flex items-center gap-3">
            <Ball size={14} className="text-white/90" />
            <span className="font-display text-[12px] font-bold uppercase tracking-[0.22em] text-white sm:text-[13px]">
              {phrase}
            </span>
            <span className="text-[14px] text-wc-gold/80" aria-hidden>
              ★
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
