import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // World Cup edition palette
        //   wc-mint  #DDF4E7 — background
        //   wc-green #67C090 — primary action / grass
        //   wc-teal  #26667F — secondary accent / kit
        //   wc-navy  #124170 — text / deep accent
        wc: {
          mint:  "#DDF4E7",
          green: "#67C090",
          teal:  "#26667F",
          navy:  "#124170",
          gold:  "#E0B23A",
          pitch: "#3F8F62",
        },
        pv: {
          // Legacy token names retained so existing utility classes keep working.
          // Values are rebound to the World Cup palette.
          bg:       "#DDF4E7",  // wc-mint
          surface:  "#EAF8EF",
          surface2: "#D2EEDD",
          border:   "#67C090",
          text:     "#124170",  // wc-navy
          muted:    "#26667F",  // wc-teal
          cyan:     "#26667F",  // teal accent
          fuch:     "#124170",  // deep navy accent
          emerald:  "#67C090",  // primary green
          gold:     "#E0B23A",
          danger:   "#B91C1C",
        },
      },
      fontFamily: {
        display: ["'Maple Mono'", "var(--font-display)", "ui-monospace", "monospace"],
        body:    ["'Maple Mono'", "var(--font-body)",    "ui-monospace", "monospace"],
        mono:    ["'Maple Mono'", "var(--font-mono)",    "ui-monospace", "monospace"],
      },
      borderRadius: {
        DEFAULT: "8px",
        sm:    "4px",
        md:    "8px",
        lg:    "10px",
        xl:    "12px",
        "2xl": "14px",
        "3xl": "16px",
        "4xl": "20px",
        full:  "9999px",
      },
      boxShadow: {
        glow:              "0 0 40px rgba(103,192,144,0.32)",
        "glow-fuch":       "0 0 40px rgba(18,65,112,0.28)",
        "glow-emerald":    "0 0 40px rgba(103,192,144,0.24)",
        "glow-gold":       "0 0 40px rgba(224,178,58,0.32)",
        "glow-lg":         "0 0 60px rgba(103,192,144,0.4)",
        "glow-fuch-lg":    "0 0 60px rgba(18,65,112,0.36)",
        "glow-emerald-lg": "0 0 60px rgba(103,192,144,0.32)",
        "glow-trophy":     "0 0 60px rgba(224,178,58,0.55), 0 0 24px rgba(224,178,58,0.4)",
      },
      keyframes: {
        fadeUp: {
          from: { opacity: "0", transform: "translateY(18px)" },
          to:   { opacity: "1", transform: "translateY(0)" },
        },
        fadeIn: {
          from: { opacity: "0" },
          to:   { opacity: "1" },
        },
        stampIn: {
          "0%":   { opacity: "0", transform: "scale(2.5) rotate(-12deg)" },
          "50%":  { opacity: "1", transform: "scale(0.95) rotate(-12deg)" },
          "100%": { opacity: "1", transform: "scale(1) rotate(-12deg)" },
        },
        confDrop: {
          "0%":   { opacity: "1", transform: "translateY(0) rotate(0deg)" },
          "100%": { opacity: "0", transform: "translateY(100vh) rotate(600deg)" },
        },
        pulseGlow: {
          "0%, 100%": { boxShadow: "0 0 20px rgba(103,192,144,0.1)" },
          "50%":      { boxShadow: "0 0 50px rgba(103,192,144,0.28)" },
        },
        blink: {
          "0%, 100%": { opacity: "1" },
          "50%":      { opacity: "0" },
        },
        countRoll: {
          from: { opacity: "0", transform: "translateY(12px)" },
          to:   { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "0%":   { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%":      { transform: "translateY(-6px)" },
        },
        "spin-slow": {
          to: { transform: "rotate(360deg)" },
        },
        /* ── Ritual system ── */
        fuseDecay: {
          "0%":   { backgroundPosition: "0% 50%" },
          "100%": { backgroundPosition: "200% 50%" },
        },
        phaseGlow: {
          "0%, 100%": { opacity: "0.4" },
          "50%":      { opacity: "1" },
        },
        tensionPulse: {
          "0%, 100%": { opacity: "0.2", transform: "scaleY(0.95)" },
          "50%":      { opacity: "0.6", transform: "scaleY(1)" },
        },
        sealFlash: {
          "0%":   { opacity: "0", transform: "scale(1.8) rotate(-8deg)" },
          "40%":  { opacity: "1", transform: "scale(0.96) rotate(-8deg)" },
          "100%": { opacity: "1", transform: "scale(1) rotate(-8deg)" },
        },
        tickDown: {
          "0%":   { opacity: "0", transform: "translateY(-8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        /* ── World Cup edition ── */
        ballRoll: {
          "0%":   { transform: "translateX(-120%) rotate(0deg)" },
          "100%": { transform: "translateX(120%) rotate(720deg)" },
        },
        ballSpin: {
          "0%":   { transform: "rotate(0deg)" },
          "100%": { transform: "rotate(360deg)" },
        },
        marquee: {
          "0%":   { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
        flagWave: {
          "0%, 100%": { transform: "translateY(0) skewX(0deg)" },
          "50%":      { transform: "translateY(-2px) skewX(-1.5deg)" },
        },
        pitchScroll: {
          "0%":   { backgroundPosition: "0% 0%" },
          "100%": { backgroundPosition: "0% 200%" },
        },
        trophyShine: {
          "0%, 100%": { filter: "drop-shadow(0 0 10px rgba(224,178,58,0.4))", transform: "translateY(0) rotate(-2deg)" },
          "50%":      { filter: "drop-shadow(0 0 28px rgba(224,178,58,0.95))", transform: "translateY(-3px) rotate(2deg)" },
        },
        sweepShine: {
          "0%":   { transform: "translateX(-150%) skewX(-20deg)" },
          "100%": { transform: "translateX(250%) skewX(-20deg)" },
        },
        kickoffPing: {
          "0%":   { transform: "scale(1)",   opacity: "0.6" },
          "100%": { transform: "scale(2.4)", opacity: "0" },
        },
      },
      animation: {
        "fade-up":    "fadeUp 0.5s ease-out both",
        "fade-in":    "fadeIn 0.3s ease-out both",
        "stamp-in":   "stampIn 0.6s ease-out both",
        "conf-drop":  "confDrop 2s ease-in forwards",
        "pulse-glow": "pulseGlow 3s ease-in-out infinite",
        blink:        "blink 1s step-end infinite",
        "count-roll": "countRoll 0.4s ease-out both",
        shimmer:      "shimmer 2s linear infinite",
        float:        "float 3s ease-in-out infinite",
        "spin-slow":  "spin-slow 8s linear infinite",
        /* ── Ritual system ── */
        "fuse-decay":     "fuseDecay 2s linear infinite",
        "phase-glow":     "phaseGlow 2s ease-in-out infinite",
        "tension-pulse":  "tensionPulse 2.5s ease-in-out infinite",
        "seal-flash":     "sealFlash 0.55s ease-out both",
        "tick-down":      "tickDown 0.25s ease-out both",
        /* ── World Cup edition ── */
        "ball-roll":     "ballRoll 9s linear infinite",
        "ball-spin":     "ballSpin 3s linear infinite",
        "marquee":       "marquee 38s linear infinite",
        "marquee-fast":  "marquee 18s linear infinite",
        "flag-wave":     "flagWave 4s ease-in-out infinite",
        "pitch-scroll":  "pitchScroll 22s linear infinite",
        "trophy-shine":  "trophyShine 2.6s ease-in-out infinite",
        "sweep-shine":   "sweepShine 2.4s ease-in-out infinite",
        "kickoff-ping":  "kickoffPing 1.6s ease-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
