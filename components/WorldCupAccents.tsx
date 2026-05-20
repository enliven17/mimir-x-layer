"use client";

import { useReducedMotion } from "framer-motion";

/**
 * Inline soccer ball SVG (classic black/white pentagon + hex pattern, stylized).
 * Sized from caller via className width/height.
 */
function BallSvg({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <defs>
        <radialGradient id="wc-ball-shade" cx="35%" cy="32%" r="70%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="55%" stopColor="#f3f6f4" />
          <stop offset="100%" stopColor="#c6d0ca" />
        </radialGradient>
      </defs>
      <circle cx="32" cy="32" r="30" fill="url(#wc-ball-shade)" stroke="#124170" strokeWidth="1.4" />
      {/* Central pentagon */}
      <polygon
        points="32,18 42,25 38,37 26,37 22,25"
        fill="#124170"
      />
      {/* Surrounding strokes (stylized seams) */}
      <g stroke="#124170" strokeWidth="1.6" fill="none" strokeLinecap="round">
        <line x1="32" y1="6"  x2="32" y2="18" />
        <line x1="48" y1="14" x2="42" y2="25" />
        <line x1="58" y1="32" x2="46" y2="34" />
        <line x1="50" y1="52" x2="38" y2="37" />
        <line x1="14" y1="52" x2="26" y2="37" />
        <line x1="6"  y1="32" x2="18" y2="34" />
        <line x1="14" y1="14" x2="22" y2="25" />
      </g>
    </svg>
  );
}

/**
 * Rolling ball — animates horizontally across its container, spinning.
 * Place inside `relative` parent. Pure decorative.
 */
export function RollingBall({
  size = 28,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  const reducedMotion = useReducedMotion();
  return (
    <div
      className={`pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 ${
        reducedMotion ? "" : "animate-ball-roll"
      } ${className}`}
      aria-hidden
      style={{ width: size, height: size }}
    >
      <BallSvg className="h-full w-full" />
    </div>
  );
}

/**
 * Static ball — same SVG but no roll animation. Optionally spins in place.
 */
export function Ball({
  size = 24,
  spin = false,
  className = "",
}: {
  size?: number;
  spin?: boolean;
  className?: string;
}) {
  const reducedMotion = useReducedMotion();
  const spinClass = spin && !reducedMotion ? "animate-ball-spin" : "";
  return (
    <span
      className={`inline-block ${spinClass} ${className}`}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <BallSvg className="h-full w-full" />
    </span>
  );
}

/**
 * Football pitch lines background — center circle + halfway line + corner arcs,
 * with a subtle vertical-stripe grass overlay that drifts (parallax).
 * Designed to be absolutely positioned inside the hero.
 */
export function FieldLines({ className = "" }: { className?: string }) {
  const reducedMotion = useReducedMotion();
  return (
    <div
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}
      aria-hidden
    >
      {/* Grass stripes — vertical, very subtle, slow drift */}
      <div
        className={`absolute inset-0 opacity-[0.08] ${
          reducedMotion ? "" : "animate-pitch-scroll"
        }`}
        style={{
          backgroundImage:
            "repeating-linear-gradient(90deg, rgba(18,65,112,0.55) 0px, rgba(18,65,112,0.55) 1px, transparent 1px, transparent 110px)",
          backgroundSize: "110px 100%",
        }}
      />
      {/* SVG pitch lines — drawn to extend beyond the visible box so the
          center circle reads clearly. */}
      <svg
        viewBox="0 0 1200 700"
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 h-full w-full opacity-[0.22]"
      >
        <g stroke="#26667F" strokeWidth="1.4" fill="none" strokeLinecap="round">
          {/* Halfway line */}
          <line x1="600" y1="0" x2="600" y2="700" />
          {/* Center circle */}
          <circle cx="600" cy="350" r="90" />
          {/* Center spot */}
          <circle cx="600" cy="350" r="2.5" fill="#26667F" stroke="none" />
          {/* Left penalty arc */}
          <path d="M 180 270 A 80 80 0 0 1 180 430" />
          {/* Right penalty arc */}
          <path d="M 1020 270 A 80 80 0 0 0 1020 430" />
          {/* Outer boundary (very subtle) */}
          <rect x="40" y="40" width="1120" height="620" rx="6" />
          {/* Corner arcs */}
          <path d="M 40 60 A 20 20 0 0 0 60 40" />
          <path d="M 1140 40 A 20 20 0 0 0 1160 60" />
          <path d="M 1160 640 A 20 20 0 0 0 1140 660" />
          <path d="M 60 660 A 20 20 0 0 0 40 640" />
        </g>
      </svg>
    </div>
  );
}

/**
 * Trophy with golden shine — for the READY TO WIN section.
 * Uses 🏆 emoji wrapped in an animated halo. Cheap, expressive, and themed.
 */
export function TrophyGlow({
  size = 48,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  const reducedMotion = useReducedMotion();
  return (
    <span
      className={`relative inline-flex items-center justify-center ${className}`}
      style={{ width: size * 1.6, height: size * 1.6 }}
      aria-hidden
    >
      {/* Halo */}
      <span
        className="absolute inset-0 rounded-full bg-wc-gold/35 blur-2xl"
        style={{
          animation: reducedMotion ? undefined : "phaseGlow 2.4s ease-in-out infinite",
        }}
      />
      {/* Spinning sun-ray ring */}
      {!reducedMotion && (
        <span
          className="absolute inset-0 animate-spin-slow opacity-50"
          style={{
            background:
              "conic-gradient(from 0deg, transparent 0deg, rgba(224,178,58,0.55) 30deg, transparent 60deg, transparent 180deg, rgba(224,178,58,0.5) 210deg, transparent 240deg)",
            borderRadius: "9999px",
            mask: "radial-gradient(circle, transparent 38%, #000 42%, #000 56%, transparent 60%)",
            WebkitMask:
              "radial-gradient(circle, transparent 38%, #000 42%, #000 56%, transparent 60%)",
          }}
        />
      )}
      {/* Trophy */}
      <span
        className={`relative ${reducedMotion ? "" : "animate-trophy-shine"}`}
        style={{ fontSize: size, lineHeight: 1 }}
      >
        🏆
      </span>
    </span>
  );
}
