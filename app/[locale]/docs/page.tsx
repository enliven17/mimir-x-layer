"use client";

import { Link } from "@/i18n/navigation";

/* ───────────────────────────────────────────────────────────────────────────
 * Inline SVG diagrams — hand-drawn in the project's blush palette so they
 * inherit the visual language without pulling in Mermaid. Each one is
 * responsive via `viewBox`; tweak only the box/text positions when copy
 * changes.
 *
 * Palette tokens used here mirror tailwind.config.ts > theme.extend.colors.pv:
 *   bg       #FCF8F8
 *   surface  #FBEFEF
 *   surface2 #F9DFDF
 *   border   #F5AFAF
 *   text     #2A1818
 *   muted    #7A5050
 *   accent   #D85F5F   (the "pv-emerald" alias, recoloured to rose)
 * ───────────────────────────────────────────────────────────────────────── */

const C = {
  bg:      "#FCF8F8",
  surface: "#FBEFEF",
  surf2:   "#F9DFDF",
  border:  "#F5AFAF",
  text:    "#2A1818",
  muted:   "#7A5050",
  accent:  "#D85F5F",
};

/* ── 1. Architecture diagram ─────────────────────────────────────────────── */
function ArchitectureDiagram() {
  return (
    <svg viewBox="0 0 760 360" className="h-auto w-full" role="img" aria-label="Mimir architecture diagram">
      <defs>
        <marker id="arrow-a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 Z" fill={C.accent} />
        </marker>
      </defs>

      {/* Users */}
      <g>
        <rect x="20" y="150" width="130" height="64" rx="14" fill={C.surface} stroke={C.border} strokeWidth="1.5" />
        <text x="85" y="178" textAnchor="middle" fontSize="13" fontWeight="700" fill={C.text}>Users</text>
        <text x="85" y="196" textAnchor="middle" fontSize="10" fill={C.muted}>MetaMask / OKX Wallet</text>
      </g>

      {/* Frontend (Vercel) */}
      <g>
        <rect x="210" y="40" width="220" height="120" rx="16" fill={C.surface} stroke={C.border} strokeWidth="1.5" />
        <text x="320" y="68" textAnchor="middle" fontSize="11" fontWeight="700" fill={C.muted} letterSpacing="2">VERCEL · FRONTEND</text>
        <text x="320" y="96" textAnchor="middle" fontSize="14" fontWeight="700" fill={C.text}>Next.js 16 app</text>
        <text x="320" y="118" textAnchor="middle" fontSize="11" fill={C.muted}>/explorer · /vs/[id]</text>
        <text x="320" y="138" textAnchor="middle" fontSize="11" fill={C.muted}>+ /api routes</text>
      </g>

      {/* Workers (Railway) */}
      <g>
        <rect x="210" y="200" width="220" height="120" rx="16" fill={C.surface} stroke={C.border} strokeWidth="1.5" />
        <text x="320" y="228" textAnchor="middle" fontSize="11" fontWeight="700" fill={C.muted} letterSpacing="2">RAILWAY · WORKERS</text>
        <text x="320" y="256" textAnchor="middle" fontSize="14" fontWeight="700" fill={C.text}>oracle + market-creator</text>
        <text x="320" y="278" textAnchor="middle" fontSize="11" fill={C.muted}>poll, evaluate, settle</text>
        <text x="320" y="298" textAnchor="middle" fontSize="11" fill={C.muted}>sign via viem signer</text>
      </g>

      {/* X Layer */}
      <g>
        <rect x="490" y="40" width="240" height="120" rx="16" fill={C.surf2} stroke={C.accent} strokeWidth="1.8" />
        <text x="610" y="68" textAnchor="middle" fontSize="11" fontWeight="700" fill={C.accent} letterSpacing="2">X LAYER TESTNET</text>
        <text x="610" y="96" textAnchor="middle" fontSize="14" fontWeight="700" fill={C.text}>Mimir.sol</text>
        <text x="610" y="118" textAnchor="middle" fontSize="11" fill={C.muted}>USDC stakes · OKB gas · chain 1952</text>
        <text x="610" y="138" textAnchor="middle" fontSize="11" fill={C.muted}>sub-second finality, EVM-equiv</text>
      </g>

      {/* LLM */}
      <g>
        <rect x="490" y="220" width="240" height="80" rx="12" fill={C.surface} stroke={C.border} strokeWidth="1.5" />
        <text x="610" y="244" textAnchor="middle" fontSize="11" fontWeight="700" fill={C.muted} letterSpacing="2">LLM PROVIDER</text>
        <text x="610" y="266" textAnchor="middle" fontSize="13" fontWeight="700" fill={C.text}>Gemini · Anthropic</text>
        <text x="610" y="286" textAnchor="middle" fontSize="11" fill={C.muted}>verdict + confidence</text>
      </g>

      {/* Arrows */}
      <line x1="150" y1="182" x2="208" y2="100" stroke={C.accent} strokeWidth="1.5" markerEnd="url(#arrow-a)" />
      <line x1="150" y1="182" x2="208" y2="260" stroke={C.accent} strokeWidth="1.5" markerEnd="url(#arrow-a)" />
      <line x1="430" y1="100" x2="488" y2="100" stroke={C.accent} strokeWidth="1.5" markerEnd="url(#arrow-a)" />
      <line x1="430" y1="260" x2="488" y2="110" stroke={C.accent} strokeWidth="1.5" markerEnd="url(#arrow-a)" />
      <line x1="430" y1="280" x2="488" y2="260" stroke={C.accent} strokeWidth="1.5" markerEnd="url(#arrow-a)" />
    </svg>
  );
}

/* ── 2. Claim lifecycle (horizontal stepper) ─────────────────────────────── */
function LifecycleDiagram() {
  const steps = [
    { tag: "01", title: "Create",   note: "Stake side A in USDC" },
    { tag: "02", title: "Challenge",note: "Side B stakes the other side" },
    { tag: "03", title: "Wait",     note: "Deadline passes" },
    { tag: "04", title: "Read",     note: "Oracle fetches evidence" },
    { tag: "05", title: "Evaluate", note: "LLM returns verdict + confidence" },
    { tag: "06", title: "Resolve",  note: "Atomic on-chain payout" },
  ];
  const W = 1100;
  const H = 220;
  const padX = 60;
  const innerW = W - padX * 2;
  const stepW = innerW / steps.length;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Claim lifecycle">
      {/* Spine */}
      <line x1={padX} y1={H / 2} x2={W - padX} y2={H / 2} stroke={C.border} strokeWidth="2" />

      {steps.map((step, i) => {
        const cx = padX + stepW * i + stepW / 2;
        return (
          <g key={step.tag}>
            <circle cx={cx} cy={H / 2} r="14" fill={C.bg} stroke={C.accent} strokeWidth="2" />
            <text x={cx} y={H / 2 + 4} textAnchor="middle" fontSize="11" fontWeight="700" fill={C.accent}>{step.tag}</text>
            <text x={cx} y={H / 2 - 36} textAnchor="middle" fontSize="14" fontWeight="700" fill={C.text}>{step.title}</text>
            <text x={cx} y={H / 2 + 50} textAnchor="middle" fontSize="11" fill={C.muted}>{step.note}</text>
          </g>
        );
      })}

      {/* Tag at each end of the spine */}
      <text x={padX} y={H / 2 - 60} fontSize="10" fontWeight="700" letterSpacing="2" fill={C.muted}>CREATOR</text>
      <text x={W - padX} y={H / 2 - 60} textAnchor="end" fontSize="10" fontWeight="700" letterSpacing="2" fill={C.muted}>ORACLE</text>
    </svg>
  );
}

/* ── 3. Oracle agent loop ────────────────────────────────────────────────── */
function AgentLoopDiagram() {
  return (
    <svg viewBox="0 0 880 360" className="h-auto w-full" role="img" aria-label="Oracle agent loop">
      <defs>
        <marker id="arrow-b" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 Z" fill={C.accent} />
        </marker>
      </defs>

      {/* Poll loop center */}
      <g>
        <circle cx="200" cy="180" r="80" fill={C.surface} stroke={C.border} strokeWidth="1.8" />
        <text x="200" y="172" textAnchor="middle" fontSize="13" fontWeight="700" fill={C.text}>Poll loop</text>
        <text x="200" y="192" textAnchor="middle" fontSize="11" fill={C.muted}>every 60s</text>
      </g>

      {/* Settler branch */}
      <g>
        <rect x="380" y="60" width="260" height="100" rx="14" fill={C.surf2} stroke={C.accent} strokeWidth="1.6" />
        <text x="510" y="86" textAnchor="middle" fontSize="11" fontWeight="700" fill={C.accent} letterSpacing="2">ROLE A · SETTLER</text>
        <text x="510" y="110" textAnchor="middle" fontSize="13" fontWeight="700" fill={C.text}>state = ACTIVE &amp; deadline passed</text>
        <text x="510" y="132" textAnchor="middle" fontSize="11" fill={C.muted}>fetch evidence → LLM → resolveClaim()</text>
      </g>

      {/* Challenger branch */}
      <g>
        <rect x="380" y="200" width="260" height="120" rx="14" fill={C.surface} stroke={C.border} strokeWidth="1.6" />
        <text x="510" y="226" textAnchor="middle" fontSize="11" fontWeight="700" fill={C.muted} letterSpacing="2">ROLE B · CHALLENGER  (opt-in)</text>
        <text x="510" y="250" textAnchor="middle" fontSize="13" fontWeight="700" fill={C.text}>state = OPEN &amp; deadline in future</text>
        <text x="510" y="272" textAnchor="middle" fontSize="11" fill={C.muted}>early LLM read → confidence ≥ 80%</text>
        <text x="510" y="290" textAnchor="middle" fontSize="11" fill={C.muted}>Kelly-sized stake (≤ 25% bankroll)</text>
        <text x="510" y="308" textAnchor="middle" fontSize="11" fill={C.muted}>requires AUTO_CHALLENGE=1</text>
      </g>

      {/* Outcome */}
      <g>
        <rect x="680" y="120" width="180" height="120" rx="14" fill={C.surface} stroke={C.border} strokeWidth="1.6" />
        <text x="770" y="146" textAnchor="middle" fontSize="11" fontWeight="700" fill={C.muted} letterSpacing="2">ON-CHAIN</text>
        <text x="770" y="172" textAnchor="middle" fontSize="14" fontWeight="700" fill={C.text}>USDC payout</text>
        <text x="770" y="194" textAnchor="middle" fontSize="11" fill={C.muted}>evidence hash committed</text>
        <text x="770" y="212" textAnchor="middle" fontSize="11" fill={C.muted}>confidence stored</text>
      </g>

      {/* Arrows from poll into branches */}
      <line x1="280" y1="160" x2="378" y2="110" stroke={C.accent} strokeWidth="1.5" markerEnd="url(#arrow-b)" />
      <line x1="280" y1="200" x2="378" y2="260" stroke={C.accent} strokeWidth="1.5" markerEnd="url(#arrow-b)" />
      <line x1="640" y1="110" x2="680" y2="170" stroke={C.accent} strokeWidth="1.5" markerEnd="url(#arrow-b)" />
      <line x1="640" y1="260" x2="680" y2="200" stroke={C.accent} strokeWidth="1.5" markerEnd="url(#arrow-b)" />
    </svg>
  );
}

/* ── Section primitives ──────────────────────────────────────────────────── */
function Section({ id, eyebrow, title, children }: { id?: string; eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 space-y-6">
      <header className="space-y-1.5">
        <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-pv-emerald">{eyebrow}</p>
        <h2 className="text-2xl font-bold tracking-tight text-pv-text sm:text-3xl">{title}</h2>
      </header>
      <div className="space-y-5 text-[15px] leading-relaxed text-pv-text/85">{children}</div>
    </section>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-pv-border/40 bg-pv-surface/70 p-5">
      <h3 className="mb-2 font-bold tracking-tight text-pv-text">{title}</h3>
      <div className="text-sm leading-relaxed text-pv-text/80">{children}</div>
    </div>
  );
}

function DiagramFrame({ children, caption }: { children: React.ReactNode; caption: string }) {
  return (
    <figure className="my-4 rounded-2xl border border-pv-border/40 bg-pv-surface/40 p-5 sm:p-7">
      <div className="overflow-x-auto">{children}</div>
      <figcaption className="mt-3 text-center text-xs text-pv-muted">{caption}</figcaption>
    </figure>
  );
}

function TocLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      className="block border-l-2 border-pv-border/40 py-1 pl-3 text-sm text-pv-text/80 transition-colors hover:border-pv-emerald hover:text-pv-text"
    >
      {label}
    </a>
  );
}

/* ── Page ────────────────────────────────────────────────────────────────── */
export default function DocsPage() {
  return (
    <article className="mx-auto max-w-4xl space-y-14 py-12">
      <header className="space-y-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-pv-emerald">
          MIMIR · DOCUMENTATION
        </p>
        <h1 className="text-4xl font-bold leading-tight tracking-tight text-pv-text sm:text-5xl">
          How Mimir works
        </h1>
        <p className="max-w-2xl text-base leading-relaxed text-pv-text/75 sm:text-lg">
          Mimir is an AI-settled claim market on X Layer Testnet — OKX&apos;s
          EVM-equivalent zkEVM L2 with OKB as the native gas token. Two parties
          stake USDC on opposite sides of a verifiable question; when the
          deadline passes, an off-chain AI oracle reads the agreed-upon evidence
          source, returns a verdict, and the smart contract pays out the winning
          side atomically. No committees, no manual disputes.
        </p>
      </header>

      {/* TOC */}
      <nav aria-label="Table of contents" className="rounded-2xl border border-pv-border/30 bg-pv-surface/40 p-5">
        <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.22em] text-pv-muted">Contents</p>
        <div className="grid gap-1 sm:grid-cols-2">
          <TocLink href="#what" label="1. What Mimir is" />
          <TocLink href="#why-xlayer" label="2. Why X Layer" />
          <TocLink href="#architecture" label="3. Architecture" />
          <TocLink href="#lifecycle" label="4. The claim lifecycle" />
          <TocLink href="#agents" label="5. The agents" />
          <TocLink href="#xlayer-stack" label="6. The X Layer stack" />
          <TocLink href="#contract" label="7. Smart contract terms" />
          <TocLink href="#play" label="8. How to play" />
          <TocLink href="#faq" label="9. FAQ" />
        </div>
      </nav>

      <Section id="what" eyebrow="01" title="What Mimir is">
        <p>
          A claim in Mimir is a single, verifiable question with a deadline and a
          designated resolution source — for example,{" "}
          <em>&ldquo;Will Argentina reach the World Cup 2026 final according to FIFA.com?&rdquo;</em>
        </p>
        <p>
          Anyone creates a claim by staking USDC on one side. Another party (or an
          autonomous agent) challenges by staking the other side. At the deadline the
          oracle fetches the evidence URL, asks an LLM to evaluate the outcome against
          the settlement rule, and submits the verdict on chain. The contract pays out
          the winning side in the same transaction.
        </p>
        <p>
          What ships on chain: the question, both positions, the resolution URL, both
          stakes, the verdict, the confidence number, and the keccak256 hash of the
          raw evidence the oracle actually saw. The hash means anyone can re-fetch
          the URL, hash it themselves, and verify the oracle isn&apos;t lying about
          its input.
        </p>
      </Section>

      <Section id="why-xlayer" eyebrow="02" title="Why X Layer">
        <p>
          X Layer is OKX&apos;s EVM-equivalent zkEVM L2 (chain id 1952 on
          testnet) with OKB as the native gas token. Stakes are denominated in
          USDC, a 6-decimal ERC-20, so payouts stay stable regardless of OKB
          price action. The combination changes the economics of a stake-and-
          settle market enough to be worth calling out:
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Card title="USDC stakes, stable payouts">
            Stakes never move with OKB price. A 5 USDC challenge is worth 5 USDC
            at settlement no matter what the gas token did in the meantime.
          </Card>
          <Card title="Predictable, sub-cent fees">
            Gas is denominated in OKB. A settlement tx costs a fraction of a cent
            regardless of network congestion, since the zkEVM rollup batches proofs
            to Ethereum L1.
          </Card>
          <Card title="Sub-second deterministic finality">
            The oracle can settle and pay out inside a single user-visible moment,
            instead of leaving funds in limbo through a long confirmation window.
          </Card>
          <Card title="Direct OKX on-ramp">
            Users withdraw OKB straight from an OKX exchange account to X Layer —
            no bridge UI, no wrapped tokens, no waiting on a third-party message
            relayer.
          </Card>
        </div>
      </Section>

      <Section id="architecture" eyebrow="03" title="Architecture">
        <p>
          Three independent tiers, each running where it fits best:
        </p>
        <DiagramFrame caption="Left to right: user wallets and worker agents on the left, Next.js frontend (Vercel) and Railway workers in the middle, X Layer contract and the LLM provider on the right.">
          <ArchitectureDiagram />
        </DiagramFrame>
        <ul className="list-disc space-y-2 pl-5 text-pv-text/85">
          <li>
            <strong className="text-pv-text">Frontend (Vercel).</strong> Next.js App
            Router with serverless API routes. Reads come straight from X Layer RPC;
            writes are user-signed via wagmi/viem.
          </li>
          <li>
            <strong className="text-pv-text">Workers (Railway).</strong> The oracle
            and market-creator agents run as long-lived Node processes. Each agent
            holds a local private key and signs through a viem account directly —
            no remote signing service in the hot path.
          </li>
          <li>
            <strong className="text-pv-text">Data (Neon Postgres).</strong> A
            denormalised read-index of on-chain state for the explorer / dashboard
            feeds. Optional — the contract remains source of truth, and pages that
            don&apos;t need feeds (stats, claim detail) work without it.
          </li>
        </ul>
      </Section>

      <Section id="lifecycle" eyebrow="04" title="The claim lifecycle">
        <DiagramFrame caption="Six discrete steps from open to settled. Steps 04–06 are entirely automated by the oracle agent.">
          <LifecycleDiagram />
        </DiagramFrame>
        <p>
          A few details matter for trust:
        </p>
        <ul className="list-disc space-y-2 pl-5 text-pv-text/85">
          <li>
            <strong className="text-pv-text">Evidence hash on chain.</strong>{" "}
            <code className="rounded bg-pv-surface2 px-1.5 py-0.5 text-xs">keccak256(raw evidence)</code>{" "}
            lands in contract storage. Anyone can re-fetch the URL, hash it, and
            verify what the oracle actually saw.
          </li>
          <li>
            <strong className="text-pv-text">Confidence is first-class.</strong>{" "}
            The LLM returns a 0–100 number that ships with the verdict. The product
            surfaces it as confident vs. contested.
          </li>
          <li>
            <strong className="text-pv-text">Refund the ambiguous.</strong>{" "}
            <code className="rounded bg-pv-surface2 px-1.5 py-0.5 text-xs">DRAW</code> and{" "}
            <code className="rounded bg-pv-surface2 px-1.5 py-0.5 text-xs">UNRESOLVABLE</code>{" "}
            are real verdicts that return stakes. Better inconclusive and refunded
            than wrong and paid out.
          </li>
          <li>
            <strong className="text-pv-text">Oracle-only resolution.</strong>{" "}
            <code className="rounded bg-pv-surface2 px-1.5 py-0.5 text-xs">resolveClaim</code>{" "}
            is gated by a single address — the oracle agent&apos;s viem signer.
            No human can quietly re-route payouts.
          </li>
        </ul>
      </Section>

      <Section id="agents" eyebrow="05" title="The agents">
        <p>
          Two background processes run continuously. Each agent holds a local
          private key and signs transactions with a viem account.
        </p>
        <DiagramFrame caption="Oracle decision tree. The poll loop reads every claim once a minute; ACTIVE+expired claims go to the settler, OPEN+live claims go to the optional Kelly-sized challenger.">
          <AgentLoopDiagram />
        </DiagramFrame>
        <div className="grid gap-4 sm:grid-cols-2">
          <Card title="Oracle agent">
            Reads expired ACTIVE claims, fetches the evidence URL, asks the LLM for
            a verdict + confidence + one-sentence explanation, and submits{" "}
            <code className="rounded bg-pv-surface2 px-1.5 py-0.5 text-xs">resolveClaim</code>{" "}
            on chain. With{" "}
            <code className="rounded bg-pv-surface2 px-1.5 py-0.5 text-xs">AUTO_CHALLENGE=1</code>{" "}
            it also stakes the contrarian side on OPEN claims it&apos;s highly
            confident about, sized by the Kelly criterion and capped at 25% of its
            bankroll.
          </Card>
          <Card title="Market-creator agent">
            Polls trusted public sources (FIFA.com, ESPN, CoinGecko) every six
            hours, asks the LLM to draft 1&ndash;5 verifiable claim candidates,
            scores each for quality, and creates the highest-scoring ones on chain
            with its own creator-side stake. Opening a claim is an economic
            commitment, not a free tweet.
          </Card>
        </div>
      </Section>

      <Section id="xlayer-stack" eyebrow="06" title="The X Layer stack">
        <p>
          X Layer is OKX&apos;s EVM-equivalent zkEVM L2 (chain id 1952 on
          testnet). OKB is the native gas token; stakes are USDC, a 6-decimal
          ERC-20. The contract pulls USDC via{" "}
          <code className="rounded bg-pv-surface2 px-1.5 py-0.5 text-xs">transferFrom</code>{" "}
          after a one-time approval and pays winners directly in USDC, so the
          unit you stake is the unit you settle in.
        </p>
        <p>
          The on-ramp is straightforward: pull testnet OKB for gas from the{" "}
          <a className="text-pv-emerald underline" href="https://www.okx.com/xlayer/faucet" target="_blank" rel="noreferrer">
            OKX X Layer faucet
          </a>{" "}
          (or withdraw OKB directly from an OKX exchange account), then top up
          test USDC on the same address. Transactions settle in under a second
          and every receipt is browsable on{" "}
          <a className="text-pv-emerald underline" href="https://www.oklink.com/xlayer-test" target="_blank" rel="noreferrer">
            OKLink
          </a>.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Card title="OKB (native gas)">
            18 decimals, native to X Layer Testnet. Pays gas for every
            interaction — a typical claim create / challenge / resolve costs a
            fraction of a cent worth of OKB.
          </Card>
          <Card title="USDC (stake)">
            6-decimal ERC-20 at{" "}
            <code className="rounded bg-pv-surface2 px-1 text-xs">0xcB8B…c79D</code>{" "}
            on X Layer Testnet. Stakes flow via{" "}
            <code className="rounded bg-pv-surface2 px-1.5 py-0.5 text-xs">approve</code>{" "}
            + <code className="rounded bg-pv-surface2 px-1.5 py-0.5 text-xs">transferFrom</code>;
            payouts use{" "}
            <code className="rounded bg-pv-surface2 px-1.5 py-0.5 text-xs">transfer</code>.
          </Card>
        </div>
      </Section>

      <Section id="contract" eyebrow="07" title="Smart contract terms">
        <p>
          A few terms that show up in the UI and on chain:
        </p>
        <div className="overflow-hidden rounded-2xl border border-pv-border/40">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-pv-surface/60 text-left text-[11px] font-bold uppercase tracking-[0.18em] text-pv-muted">
                <th className="px-4 py-3">Term</th>
                <th className="px-4 py-3">What it means</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-pv-border/30">
              <tr><td className="px-4 py-3 align-top font-mono text-xs text-pv-emerald">creator</td><td className="px-4 py-3 align-top text-pv-text/85">The address that opened the claim and staked side A.</td></tr>
              <tr><td className="px-4 py-3 align-top font-mono text-xs text-pv-emerald">challengerStake</td><td className="px-4 py-3 align-top text-pv-text/85">Sum of all side-B stakes (pool mode) or single counter-stake (1v1).</td></tr>
              <tr><td className="px-4 py-3 align-top font-mono text-xs text-pv-emerald">oddsMode</td><td className="px-4 py-3 align-top text-pv-text/85"><code className="rounded bg-pv-surface2 px-1 text-xs">pool</code> = pari-mutuel, <code className="rounded bg-pv-surface2 px-1 text-xs">fixed</code> = creator-backed multipliers.</td></tr>
              <tr><td className="px-4 py-3 align-top font-mono text-xs text-pv-emerald">deadline</td><td className="px-4 py-3 align-top text-pv-text/85">UTC unix timestamp. After this the oracle can settle.</td></tr>
              <tr><td className="px-4 py-3 align-top font-mono text-xs text-pv-emerald">winnerSide</td><td className="px-4 py-3 align-top text-pv-text/85"><code className="rounded bg-pv-surface2 px-1 text-xs">CREATOR</code>, <code className="rounded bg-pv-surface2 px-1 text-xs">CHALLENGERS</code>, <code className="rounded bg-pv-surface2 px-1 text-xs">DRAW</code> (refund), or <code className="rounded bg-pv-surface2 px-1 text-xs">UNRESOLVABLE</code> (refund).</td></tr>
              <tr><td className="px-4 py-3 align-top font-mono text-xs text-pv-emerald">evidenceHash</td><td className="px-4 py-3 align-top text-pv-text/85"><code className="rounded bg-pv-surface2 px-1 text-xs">keccak256</code> of the raw bytes the oracle fetched from the resolution URL.</td></tr>
              <tr><td className="px-4 py-3 align-top font-mono text-xs text-pv-emerald">confidence</td><td className="px-4 py-3 align-top text-pv-text/85">0–100. The LLM&apos;s self-assessed certainty for that verdict.</td></tr>
            </tbody>
          </table>
        </div>
      </Section>

      <Section id="play" eyebrow="08" title="How to play">
        <ol className="list-decimal space-y-3 pl-5 text-pv-text/85">
          <li>
            <strong className="text-pv-text">Get testnet OKB.</strong>{" "}
            Pull it from the{" "}
            <a className="text-pv-emerald underline" href="https://www.okx.com/xlayer/faucet" target="_blank" rel="noreferrer">
              OKX X Layer faucet
            </a>, or withdraw OKB from an OKX exchange account directly to your
            X Layer address.
          </li>
          <li>
            <strong className="text-pv-text">Connect your wallet.</strong>{" "}
            The site auto-switches you to X Layer Testnet on connect and adds the
            chain (id 1952) if your wallet doesn&apos;t know it.
          </li>
          <li>
            <strong className="text-pv-text">Either create a claim or challenge one.</strong>{" "}
            Browse the <Link href="/explorer" className="text-pv-emerald underline">explorer</Link>{" "}
            for open markets, or open your own with{" "}
            <Link href="/vs/create" className="text-pv-emerald underline">/vs/create</Link>.
            Stake at least 1 USDC.
          </li>
          <li>
            <strong className="text-pv-text">Wait.</strong>{" "}
            At the deadline the oracle does its thing. You don&apos;t need to
            click anything — the contract pays out automatically.
          </li>
          <li>
            <strong className="text-pv-text">Check the receipt.</strong>{" "}
            The settlement card shows the verdict, the explanation, the evidence
            hash, and the on-chain tx (linked to OKLink).
          </li>
        </ol>
      </Section>

      <Section id="faq" eyebrow="09" title="FAQ">
        <div className="space-y-5">
          <Card title="Do I need MetaMask?">
            Any injected EVM wallet works (MetaMask, OKX Wallet, Rabby,
            Coinbase Wallet, etc.) plus WalletConnect. The frontend uses wagmi v3.
          </Card>
          <Card title="What if the LLM is wrong?">
            The verdict ships with a confidence number, the evidence URL, and a
            keccak256 hash of the raw page bytes. Anyone can verify the oracle
            wasn&apos;t hallucinating. Truly ambiguous claims resolve as{" "}
            <code className="rounded bg-pv-surface2 px-1 text-xs">UNRESOLVABLE</code>{" "}
            and refund — the protocol prefers refunding ambiguity to fabricating
            certainty.
          </Card>
          <Card title="Can the oracle be replaced?">
            The contract&apos;s <code className="rounded bg-pv-surface2 px-1 text-xs">oracle</code> address
            is set at deploy and changeable only by the owner. The deploy script
            transfers ownership to a separate cold address immediately after deploy.
          </Card>
          <Card title="Is the agent betting against me?">
            Only with <code className="rounded bg-pv-surface2 px-1 text-xs">AUTO_CHALLENGE=1</code>{" "}
            enabled, and only when its own confidence on the contrarian side is
            ≥ 80%. Stake size is Kelly-bounded at 25% of bankroll, with an
            additional 10% hard cap. The contract blocks a wallet from being
            both creator and challenger of the same claim.
          </Card>
          <Card title="Mainnet?">
            X Layer is testnet-only for Mimir as of writing. The codebase is
            chain-config driven (see <code className="rounded bg-pv-surface2 px-1 text-xs">lib/xlayer.ts</code>) —
            an X Layer mainnet redeploy is mostly a single chain definition swap.
          </Card>
        </div>
      </Section>

      <footer className="border-t border-pv-border/30 pt-8 text-sm text-pv-muted">
        Got a question that isn&apos;t answered here?{" "}
        <a className="text-pv-emerald underline" href="https://github.com/enliven17/mimir/issues" target="_blank" rel="noreferrer">
          Open an issue on GitHub
        </a>
        .
      </footer>
    </article>
  );
}
