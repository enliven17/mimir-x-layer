import Link from "next/link";
import {
  createArcPublicClient,
  getContractAddress,
  microToUsdc,
  weiToOkb,
  getExplorerAddressUrl,
} from "@/lib/arc";
import { MIMIR_ABI, WINNER_SIDE } from "@/lib/mimir-abi";
import {
  countPunditPicks,
  getRecentPunditPicks,
  getClaimsCreatedBy,
  getChallengesBy,
  getResolvedClaimsFeed,
  getAgentCounts,
  type PunditPickRow,
} from "@/lib/db";

// Rendered on each request (no build-time prerender). The page reads several
// log ranges from X Layer's public RPC; doing that during Vercel's static
// generation reliably hits the RPC's 429 rate limit. Runtime-only avoids
// that — and Vercel's edge cache + the browser still keep it cheap.
export const dynamic = "force-dynamic";

/* ── Data ────────────────────────────────────────────────────────────────── */
//
// Source of truth: Neon read-index (`claims`, `challengers`).
// We deliberately do NOT page through eth_getLogs here — X Layer's public RPC
// is 5 req/sec and a full pagination from deploy-block to tip is several
// thousand chunks. The indexer (sync routes / oracle worker) writes to Neon;
// this page reads from it.

type EventRow =
  | {
      kind:      "created";
      claimId:   number;
      actor:     string;
      category:  string;
      ts:        number;
    }
  | {
      kind:      "challenged";
      claimId:   number;
      actor:     string;
      stakeWei:  bigint;
      ts:        number;
    }
  | {
      kind:      "resolved";
      claimId:   number;
      winnerSide: string;       // "creator" | "challengers" | "draw" | "unresolvable" | ""
      confidence: number;
      summary:    string;
      ts:         number;
    };

async function fetchEventsFromIndex(addresses: {
  oracle?:  string;
  creator?: string;
  pundit?:  string | null;
}): Promise<EventRow[]> {
  try {
    const [resolved, oracleStakes, punditStakes, creatorMarkets, punditMarkets] =
      await Promise.all([
        getResolvedClaimsFeed(40),
        addresses.oracle ? getChallengesBy(addresses.oracle, 40) : Promise.resolve([]),
        addresses.pundit ? getChallengesBy(addresses.pundit, 40) : Promise.resolve([]),
        addresses.creator ? getClaimsCreatedBy(addresses.creator, 40) : Promise.resolve([]),
        addresses.pundit ? getClaimsCreatedBy(addresses.pundit, 40) : Promise.resolve([]),
      ]);

    const rows: EventRow[] = [
      ...resolved.map((c) => ({
        kind:       "resolved" as const,
        claimId:    c.id,
        winnerSide: c.winner_side,
        confidence: c.confidence,
        summary:    (c.resolution_summary ?? "").slice(0, 180),
        ts:         c.updated_at,
      })),
      ...oracleStakes.map((s) => ({
        kind:     "challenged" as const,
        claimId:  s.claim_id,
        actor:    s.address,
        stakeWei: BigInt(s.stake),
        ts:       s.updated_at,
      })),
      ...punditStakes.map((s) => ({
        kind:     "challenged" as const,
        claimId:  s.claim_id,
        actor:    s.address,
        stakeWei: BigInt(s.stake),
        ts:       s.updated_at,
      })),
      ...creatorMarkets.map((c) => ({
        kind:     "created" as const,
        claimId:  c.id,
        actor:    c.creator,
        category: c.category,
        ts:       c.created_at || c.updated_at,
      })),
      ...punditMarkets.map((c) => ({
        kind:     "created" as const,
        claimId:  c.id,
        actor:    c.creator,
        category: c.category,
        ts:       c.created_at || c.updated_at,
      })),
    ];

    rows.sort((a, b) => b.ts - a.ts);
    return rows;
  } catch (err) {
    console.error("[agents] fetchEventsFromIndex failed:", err);
    return [];
  }
}

async function fetchPunditDbData(): Promise<{
  address: string | null;
  picks:   PunditPickRow[];
  counts:  { total: number; creates: number; challenges: number };
} | null> {
  const address = (process.env.PUNDIT_ADDRESS ?? "").trim().toLowerCase();
  try {
    const [picks, counts] = await Promise.all([
      getRecentPunditPicks(3),
      countPunditPicks(),
    ]);
    return { address: address || null, picks, counts };
  } catch (err) {
    console.error("[agents] fetchPunditDbData failed:", err);
    return null;
  }
}

// X Layer public RPC is 5 req/sec. We need 2 reads (oracle, owner) + up to
// 3 balance lookups (oracle, creator, pundit). Run them with a tiny gap so
// we stay well under the bucket — total ~5 requests over ~600ms.
async function rpcThrottled<T>(fns: Array<() => Promise<T>>, gapMs = 120): Promise<T[]> {
  const out: T[] = [];
  for (const fn of fns) {
    out.push(await fn());
    if (gapMs > 0) await new Promise((r) => setTimeout(r, gapMs));
  }
  return out;
}

async function fetchAgentAddresses() {
  const client  = createArcPublicClient();
  const address = getContractAddress();
  try {
    const [oracle, owner] = await rpcThrottled<`0x${string}`>([
      () => client.readContract({ address, abi: MIMIR_ABI, functionName: "oracle" }) as Promise<`0x${string}`>,
      () => client.readContract({ address, abi: MIMIR_ABI, functionName: "owner"  }) as Promise<`0x${string}`>,
    ]);
    const [oracleBal, ownerBal] = await rpcThrottled<bigint>([
      () => client.getBalance({ address: oracle }),
      () => client.getBalance({ address: owner }),
    ]);
    return { oracle, owner, oracleBal, ownerBal };
  } catch (err) {
    console.error("[agents] fetchAgentAddresses failed:", err);
    return null;
  }
}

/* ── UI bits ─────────────────────────────────────────────────────────────── */

function shortAddr(a: string): string {
  if (!a || a.length < 10) return a;
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

const SIDE_LABEL: Record<string, string> = {
  creator:      "creator won",
  challengers:  "challengers won",
  draw:         "draw · refunded",
  unresolvable: "unresolvable · refunded",
};

function ActorTag({
  addr,
  oracle,
  creator,
  pundit,
}: {
  addr:    string;
  oracle?: string;
  creator?: string;
  pundit?: string | null;
}) {
  const norm = addr.toLowerCase();
  if (norm === oracle?.toLowerCase()) {
    return <span className="inline-flex items-center rounded-md border border-pv-emerald/40 bg-pv-emerald/[0.08] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-pv-emerald">oracle</span>;
  }
  if (norm === creator?.toLowerCase()) {
    return <span className="inline-flex items-center rounded-md border border-pv-border/60 bg-pv-surface2/60 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-pv-text/80">market-creator</span>;
  }
  if (pundit && norm === pundit.toLowerCase()) {
    return <span className="inline-flex items-center rounded-md border border-amber-400/40 bg-amber-400/[0.10] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-amber-600">pundit</span>;
  }
  return <span className="font-mono text-[11px] text-pv-muted">{shortAddr(addr)}</span>;
}

function tierPill(c: number) {
  if (c >= 80) return { label: "FIRM", cls: "border-pv-emerald/40 bg-pv-emerald/[0.08] text-pv-emerald" };
  if (c >= 60) return { label: "CONTESTED", cls: "border-pv-border/60 bg-pv-surface2/60 text-pv-text/80" };
  if (c > 0)   return { label: "LOW", cls: "border-amber-400/40 bg-amber-400/[0.10] text-amber-700" };
  return { label: "—", cls: "border-pv-border/40 bg-pv-surface2/40 text-pv-muted" };
}

/* ── Page ────────────────────────────────────────────────────────────────── */

export default async function AgentsPage() {
  // 1) RPC: agent addresses + balances (throttled to stay under 5 req/sec).
  const agentInfo = await fetchAgentAddresses();

  // 2) DB-side: pundit picks + counts + activity feed (Postgres, no RPC).
  const pundit = await fetchPunditDbData();

  const addresses = {
    oracle:  agentInfo?.oracle,
    creator: agentInfo?.owner,
    pundit:  pundit?.address ?? null,
  };

  const [events, counts, punditBal] = await Promise.all([
    fetchEventsFromIndex(addresses),
    getAgentCounts({
      oracle:  addresses.oracle,
      creator: addresses.creator,
      pundit:  addresses.pundit ?? undefined,
    }),
    // One more RPC, but small. Skip if no pundit address.
    addresses.pundit
      ? createArcPublicClient()
          .getBalance({ address: addresses.pundit as `0x${string}` })
          .catch(() => 0n)
      : Promise.resolve(0n),
  ]);

  const oracleSettlements    = counts.oracleSettlements;
  const oracleChallenges     = counts.oracleChallenges;
  const creatorMarketsOpened = counts.creatorMarkets;

  const agentEvents = events;

  return (
    <main className="mx-auto max-w-[1100px] px-4 py-10 sm:px-6 lg:px-8">
      <header className="mb-8 space-y-1.5">
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-pv-emerald">Agent activity log</p>
        <h1 className="font-display text-3xl font-bold tracking-tight text-pv-text sm:text-4xl">
          What the AI agents have actually done
        </h1>
        <p className="max-w-2xl text-sm text-pv-muted">
          Activity feed for Mimir&apos;s three autonomous agents. Sourced from
          the Neon read-index that the oracle worker keeps in sync with
          X Layer Testnet.
        </p>
      </header>

      {/* Agent profiles */}
      {agentInfo && (
        <section className="mb-10 grid gap-4 lg:grid-cols-3">
          <article className="rounded-2xl border border-pv-emerald/35 bg-pv-emerald/[0.05] p-5">
            <div className="mb-1 flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-pv-emerald">Oracle agent</span>
              <a href={getExplorerAddressUrl(agentInfo.oracle)} target="_blank" rel="noreferrer" className="ml-auto font-mono text-[11px] text-pv-muted hover:text-pv-emerald">
                {shortAddr(agentInfo.oracle)} ↗
              </a>
            </div>
            <p className="mt-1 text-sm text-pv-text/85">
              Reads expired claims, fetches evidence, asks an LLM, and settles. With auto-challenger on, also stakes USDC on mispriced open claims using Kelly.
            </p>
            <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-pv-emerald/80">Balance</div>
                <div className="mt-0.5 font-display text-base font-bold tabular-nums text-pv-text">{weiToOkb(agentInfo.oracleBal).toFixed(4)} <span className="text-xs text-pv-muted">OKB</span></div>
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-pv-emerald/80">Settled</div>
                <div className="mt-0.5 font-display text-base font-bold tabular-nums text-pv-text">{oracleSettlements}</div>
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-pv-emerald/80">Auto-stakes</div>
                <div className="mt-0.5 font-display text-base font-bold tabular-nums text-pv-text">{oracleChallenges}</div>
              </div>
            </div>
          </article>

          <article className="rounded-2xl border border-pv-border/40 bg-pv-surface/70 p-5">
            <div className="mb-1 flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-pv-text/80">Market-creator agent</span>
              <a href={getExplorerAddressUrl(agentInfo.owner)} target="_blank" rel="noreferrer" className="ml-auto font-mono text-[11px] text-pv-muted hover:text-pv-emerald">
                {shortAddr(agentInfo.owner)} ↗
              </a>
            </div>
            <p className="mt-1 text-sm text-pv-text/85">
              Polls public sources (CoinGecko, ESPN, OpenWeather) every 6h, asks an LLM to draft verifiable claim candidates, and opens the highest-scoring ones with its own creator-side stake.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-pv-text/60">Balance</div>
                <div className="mt-0.5 font-display text-base font-bold tabular-nums text-pv-text">{weiToOkb(agentInfo.ownerBal).toFixed(4)} <span className="text-xs text-pv-muted">OKB</span></div>
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-pv-text/60">Markets opened</div>
                <div className="mt-0.5 font-display text-base font-bold tabular-nums text-pv-text">{creatorMarketsOpened}</div>
              </div>
            </div>
          </article>

          {pundit && (
            <article className="rounded-2xl border border-amber-400/40 bg-amber-400/[0.06] p-5">
              <div className="mb-1 flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-amber-600">Pundit agent</span>
                {pundit.address && (
                  <a href={getExplorerAddressUrl(pundit.address as `0x${string}`)} target="_blank" rel="noreferrer" className="ml-auto font-mono text-[11px] text-pv-muted hover:text-amber-600">
                    {shortAddr(pundit.address)} ↗
                  </a>
                )}
              </div>
              <p className="mt-1 text-sm text-pv-text/85">
                A football commentator persona. Every {`${process.env.PUNDIT_INTERVAL_HOURS ?? "2"}h`} it scans open sport claims, runs an independent pre-event analysis (form, H2H, injuries), and stakes USDC on the side it disagrees with. Occasionally opens its own opinionated markets.
              </p>
              <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-600/80">Balance</div>
                  <div className="mt-0.5 font-display text-base font-bold tabular-nums text-pv-text">{weiToOkb(punditBal).toFixed(4)} <span className="text-xs text-pv-muted">OKB</span></div>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-600/80">Picks</div>
                  <div className="mt-0.5 font-display text-base font-bold tabular-nums text-pv-text">{pundit.counts.challenges}</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-600/80">Opened</div>
                  <div className="mt-0.5 font-display text-base font-bold tabular-nums text-pv-text">{pundit.counts.creates}</div>
                </div>
              </div>
              {pundit.picks.length > 0 && (
                <div className="mt-4 border-t border-amber-400/20 pt-3">
                  <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-amber-600/80">🎙️ Latest hot takes</div>
                  <ul className="space-y-2">
                    {pundit.picks.map((p) => (
                      <li key={p.id} className="text-[12px] leading-snug text-pv-text/85">
                        <span className="font-mono text-[10px] text-amber-600/80">
                          {p.action_type === "create" ? "opened" : `picked ${p.pick_side}`} · {p.confidence}%
                          {p.claim_id > 0 && (
                            <> · <Link href={`/vs/${p.claim_id}`} className="hover:text-amber-600">claim #{p.claim_id}</Link></>
                          )}
                        </span>
                        <div className="mt-0.5">&ldquo;{p.hot_take}&rdquo;</div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </article>
          )}
        </section>
      )}

      {/* Combined live feed */}
      <section>
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="font-display text-xl font-bold tracking-tight text-pv-text">Live agent feed</h2>
          <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-pv-muted">{agentEvents.length} agent {agentEvents.length === 1 ? "event" : "events"}</span>
        </div>
        {agentEvents.length === 0 ? (
          <div className="rounded-2xl border border-pv-border/30 bg-pv-surface/70 p-8 text-center text-sm text-pv-muted">
            No on-chain agent activity yet. Once the oracle settles, the market-creator opens a claim, or the pundit calls a pick, events stream here.
          </div>
        ) : (
          <ul className="space-y-3">
            {agentEvents.map((e, i) => (
              <li
                key={`${e.kind}-${e.claimId}-${e.ts}-${i}`}
                className="rounded-2xl border border-pv-border/30 bg-pv-surface/70 p-4"
              >
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <Link
                    href={`/vs/${e.claimId}`}
                    className="font-mono text-[11px] text-pv-emerald hover:text-pv-text"
                  >
                    claim #{e.claimId}
                  </Link>
                  {e.kind === "created" && (
                    <>
                      <ActorTag addr={e.actor} oracle={agentInfo?.oracle} creator={agentInfo?.owner} pundit={pundit?.address} />
                      <span className="text-[13px] font-bold text-pv-text">opened a market</span>
                      <span className="text-[11px] text-pv-muted">· {e.category}</span>
                    </>
                  )}
                  {e.kind === "challenged" && (
                    <>
                      <ActorTag addr={e.actor} oracle={agentInfo?.oracle} creator={agentInfo?.owner} pundit={pundit?.address} />
                      <span className="text-[13px] font-bold text-pv-text">staked the contrarian side</span>
                      <span className="text-[11px] font-mono text-pv-text/85">{microToUsdc(e.stakeWei).toFixed(2)} USDC</span>
                    </>
                  )}
                  {e.kind === "resolved" && (() => {
                    const t = tierPill(e.confidence);
                    return (
                      <>
                        <span className="inline-flex items-center rounded-md border border-pv-emerald/40 bg-pv-emerald/[0.08] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-pv-emerald">oracle</span>
                        <span className="text-[13px] font-bold text-pv-text">resolved · {SIDE_LABEL[e.winnerSide] ?? "unknown"}</span>
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] ${t.cls}`}>{t.label} · {e.confidence}%</span>
                      </>
                    );
                  })()}
                  {e.ts > 0 && (
                    <span className="ml-auto font-mono text-[10px] text-pv-muted">
                      {new Date(e.ts).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  )}
                </div>
                {e.kind === "resolved" && e.summary && (
                  <p className="mt-2 text-[12px] leading-relaxed text-pv-text/75">{e.summary}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="mt-10 text-center">
        <Link href="/stats" className="text-sm text-pv-muted transition-colors hover:text-pv-text">View aggregate stats →</Link>
      </div>
    </main>
  );
}
