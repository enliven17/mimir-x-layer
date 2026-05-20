"use client";

import WorldCupMarquee from "./WorldCupMarquee";
import { Ball } from "./WorldCupAccents";

export default function Footer() {
  return (
    <footer className="relative mt-12">
      {/* WC Marquee — full-bleed above the footer info row */}
      <div className="relative left-1/2 w-screen -translate-x-1/2">
        <WorldCupMarquee />
      </div>

      <div className="border-t border-pv-fuch/15 bg-pv-bg/60 backdrop-blur-sm">
        <div className="mx-auto flex max-w-[1100px] flex-col items-center justify-between gap-3 px-4 py-6 text-xs text-pv-muted/85 sm:flex-row sm:px-6">
          <span className="inline-flex items-center gap-2 font-display font-semibold tracking-tight text-pv-text/85">
            <Ball size={14} />
            Mimir<span className="text-pv-emerald">.</span>
            <span className="ml-1 hidden font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-wc-teal sm:inline-block">
              World Cup Edition · 2026
            </span>
          </span>
          <span className="font-mono tracking-wide">
            AI-settled match claims on X Layer
          </span>
        </div>
      </div>
    </footer>
  );
}
