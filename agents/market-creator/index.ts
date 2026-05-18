/**
 * Mimir Market Creator Agent — World Cup edition
 *
 * Autonomously creates FIFA World Cup 2026-themed prediction markets from
 * public football data sources:
 *   - ESPN soccer scoreboard + standings
 *   - FIFA.com official tournament data (group stage, knockout, top scorer)
 *   - SofaScore / Wikipedia fallback for static fixture data
 *
 * Flow:
 *   1. Fetch the next batch of World Cup-relevant events
 *   2. Use an LLM to draft binary, verifiable claim candidates
 *   3. Score candidates for clarity, source quality, deadline timing
 *   4. Create top-scored claims on-chain via the Mimir contract (USDC stake)
 *   5. The creator side is funded from the agent's own USDC bankroll, so
 *      every market is an economic commitment, not a free post.
 *
 * Run: npx tsx agents/market-creator/index.ts
 * Env: CREATOR_PRIVATE_KEY, NEXT_PUBLIC_CONTRACT_ADDRESS, GEMINI_API_KEY
 *      CREATOR_STAKE_USDC=2      (USDC per market, default 2)
 *      MAX_CLAIMS_PER_RUN=5      (max new claims per run, default 5)
 *      RUN_INTERVAL_HOURS=6      (hours between runs, default 6h)
 *
 * Stakes are denominated in USDC (USDC_TEST on X Layer Testnet, 6 decimals).
 * Gas is paid in native OKB.
 */

import { callLLM, activeLLMProvider, activeLLMModel } from "../../lib/llm";
import {
  createArcPublicClient,
  arcTestnet,
  getContractAddress,
  getExplorerTxUrl,
  usdcToMicro,
  microToUsdc,
} from "../../lib/arc";
import {
  executeContract,
  buildAbiFunctionSignature,
  toCircleAbiParameters,
  ensureUsdcAllowance,
  getUsdcBalance,
  getMarketCreatorWalletId,
  getMarketCreatorAddress,
} from "../../lib/circle-w3s";
import { MIMIR_ABI } from "../../lib/mimir-abi";

// ── Config ────────────────────────────────────────────────────────────────────
const CONTRACT_ADDRESS    = getContractAddress();
const CREATOR_STAKE_USDC  = Number(process.env.CREATOR_STAKE_USDC ?? "2");
const MAX_CLAIMS_PER_RUN  = Number(process.env.MAX_CLAIMS_PER_RUN ?? "5");
const RUN_INTERVAL_HOURS  = Number(process.env.RUN_INTERVAL_HOURS ?? "6");
const MIN_QUALITY_SCORE   = 70; // 0-100

try {
  getMarketCreatorAddress();
} catch (err: any) {
  console.error(err?.message ?? err);
  process.exit(1);
}
if (!process.env.GEMINI_API_KEY?.trim() && !process.env.ANTHROPIC_API_KEY?.trim()) {
  console.error("GEMINI_API_KEY or ANTHROPIC_API_KEY env var is required");
  process.exit(1);
}

const SIG_CREATE_CLAIM = buildAbiFunctionSignature("createClaim", MIMIR_ABI);

// ── Clients ───────────────────────────────────────────────────────────────────
const publicClient   = createArcPublicClient();
const CREATOR_WALLET = getMarketCreatorWalletId();
const CREATOR_ADDR   = getMarketCreatorAddress();

// ── Types ─────────────────────────────────────────────────────────────────────
interface ClaimCandidate {
  question:         string;
  creatorPosition:  string;
  counterPosition:  string;
  resolutionUrl:    string;
  category:         string;
  marketType:       string;
  settlementRule:   string;
  deadlineHours:    number;
  qualityScore:     number;
  sourceType:       string;
}

// ── Source fetchers ───────────────────────────────────────────────────────────
//
// World Cup focus: anything that affects the FIFA World Cup 2026 narrative —
// tournament odds, recent friendlies for participating nations, key player
// status, federation rankings — is fair game.

async function fetchWorldCupOverview(): Promise<string> {
  // Static context the LLM can always rely on. Group draws / participants /
  // dates are public information; refresh manually here as the tournament
  // narrative evolves.
  return [
    "FIFA World Cup 2026 — 11 June 2026 to 19 July 2026",
    "Hosts: USA, Canada, Mexico (16 host cities, 48 teams, 104 matches)",
    "Format: 12 groups of 4. Top 2 + 8 best 3rd-place teams advance to Round of 32.",
    "Top contenders (per pre-tournament odds): Spain, France, Argentina, Brazil,",
    "England, Portugal, Germany, Netherlands.",
    "Golden Boot favourites: Mbappé, Yamal, Vinícius Jr, Harry Kane, Erling Haaland.",
    "Official tournament URL: https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026",
  ].join("\n");
}

async function fetchUpcomingSoccer(): Promise<string> {
  // ESPN's public scoreboard for international football fixtures + friendlies.
  try {
    const res = await fetch(
      "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.worldq.uefa/scoreboard",
      { headers: { "User-Agent": "Mimir-MarketCreator/1.0" } },
    );
    const data = (await res.json()) as any;
    const events = (data.events ?? []).slice(0, 8);
    if (events.length === 0) return "(no upcoming UEFA qualifier fixtures right now)";
    return events
      .map((e: any) => {
        const comps = e.competitions?.[0]?.competitors ?? [];
        const teams = comps.map((c: any) => c.team?.displayName).filter(Boolean).join(" vs ");
        const when = e.date ? new Date(e.date).toISOString() : "TBA";
        return `${teams} — ${when} (${e.status?.type?.description ?? "scheduled"})`;
      })
      .join("\n");
  } catch {
    return "(ESPN soccer feed unavailable; rely on the World Cup overview block)";
  }
}

async function fetchTopScorerMarket(): Promise<string> {
  // Static prompt material so the LLM can draft golden-boot / top-scorer markets.
  return [
    "Top-scorer / Golden Boot market angle:",
    "  resolution URL options: https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/statistics/players",
    "                          https://en.wikipedia.org/wiki/2026_FIFA_World_Cup#Top_scorers",
    "                          https://www.espn.com/soccer/competitions/_/id/fifa.world",
    "Useful narrative: France's Mbappé vs Spain's Yamal vs Brazil's Vinícius Jr.",
  ].join("\n");
}

// ── Claude drafts claims ──────────────────────────────────────────────────────

async function draftClaimCandidates(sourceData: {
  worldCup: string;
  fixtures: string;
  topScorer: string;
}): Promise<ClaimCandidate[]> {
  const now     = new Date();
  const prompt  = `You are Mimir, an AI that creates high-quality FIFA World Cup 2026 prediction market claims for a USDC-staked market on X Layer (OKX zkEVM L2).

## Tournament context
${sourceData.worldCup}

## Upcoming international fixtures (ESPN feed)
${sourceData.fixtures}

## Top-scorer market angle
${sourceData.topScorer}

## Task
Create ${MAX_CLAIMS_PER_RUN} World Cup-themed prediction market candidates. Each must be:
- **World Cup relevant**: tournament outcomes, group-stage results, knockout
  matches, top-scorer race, individual team / player props, or qualifier
  fixtures involving participating nations. Reject anything unrelated.
- **Verifiable**: resolvable from a specific public URL (FIFA.com,
  Wikipedia's tournament article, ESPN soccer scoreboard, SofaScore).
- **Binary**: a clear YES/NO outcome.
- **Time-bounded**: deadline between 2 and 72 hours from now (${now.toISOString()}).
  For long-horizon questions (tournament champion, top scorer), set the
  deadline 24-72 hours out and frame the question around a tournament-stage
  milestone that's actually verifiable within that window — e.g. "Will
  France be top of Group D after their first match (per FIFA.com) by
  <date>?" instead of "Will France win the World Cup?".
- **Specific**: no vague language like "probably" or "might".

Spread the ${MAX_CLAIMS_PER_RUN} candidates across these angles when possible:
match-outcome (1X2 framed as binary), group-stage standing, knockout
progression, top-scorer leader, total goals over/under, individual player
prop (goals scored, cards), tournament narrative (e.g. host nations advance).

For each candidate, return strict JSON:
{
  "question":        "Will [specific thing] happen by [specific date/time]?",
  "creatorPosition": "Yes — [brief reason]",
  "counterPosition": "No — [brief reason]",
  "resolutionUrl":   "https://...",
  "category":        "match" | "groupstage" | "knockout" | "playerprop" | "tournament" | "topscorer",
  "marketType":      "binary",
  "settlementRule":  "Resolve YES if [exact, observable condition] at the resolution URL at deadline.",
  "deadlineHours":   <2-72>,
  "qualityScore":    <0-100>,
  "sourceType":      "fifa" | "espn" | "wikipedia" | "sofascore"
}

Return a JSON array of ${MAX_CLAIMS_PER_RUN} candidates. Output JSON only.`;

  const text = await callLLM(prompt, { maxTokens: 2000, jsonOnly: true });
  try {
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error("No JSON array in response");
    const candidates = JSON.parse(jsonMatch[0]) as ClaimCandidate[];
    return candidates.filter((c) => c.qualityScore >= MIN_QUALITY_SCORE);
  } catch (err) {
    console.warn("[market-creator] Failed to parse candidates:", err);
    return [];
  }
}

// ── Create claim on-chain ─────────────────────────────────────────────────────

async function createClaim(candidate: ClaimCandidate): Promise<string | null> {
  const deadline = BigInt(Math.floor(Date.now() / 1000) + candidate.deadlineHours * 3600);
  const stake    = usdcToMicro(CREATOR_STAKE_USDC);

  // Need enough USDC for the stake itself + enough OKB to pay gas.
  const [usdc, okb] = await Promise.all([
    getUsdcBalance(CREATOR_WALLET),
    publicClient.getBalance({ address: CREATOR_ADDR }),
  ]);
  if (usdc < stake) {
    console.warn(`[market-creator] Insufficient USDC (${microToUsdc(usdc).toFixed(2)}) for ${candidate.question.slice(0, 40)}`);
    return null;
  }
  if (okb < 5n * 10n ** 15n) {
    console.warn(`[market-creator] Insufficient OKB gas — top up ${CREATOR_ADDR}`);
    return null;
  }

  try {
    // ERC-20 flow: approve the Mimir contract to pull USDC, then call createClaim.
    const approveTx = await ensureUsdcAllowance(CREATOR_WALLET, CONTRACT_ADDRESS, stake);
    if (approveTx) console.log(`[market-creator]   approve USDC — ${getExplorerTxUrl(approveTx)}`);

    const txHash = await executeContract({
      walletId:             CREATOR_WALLET,
      contractAddress:      CONTRACT_ADDRESS,
      abiFunctionSignature: SIG_CREATE_CLAIM,
      abiParameters: toCircleAbiParameters([
        candidate.question,
        candidate.creatorPosition,
        candidate.counterPosition,
        candidate.resolutionUrl,
        deadline,
        stake,
        candidate.category,
        BigInt(0),                   // parentId
        candidate.marketType,
        "pool",                      // oddsMode
        BigInt(0),                   // challengerPayoutBps
        "",                          // handicapLine
        candidate.settlementRule,
        BigInt(100),                 // maxChallengers
        false,                       // isPrivate
        "",                          // inviteKey
      ]),
      refId:  `mc-${Date.now()}`,
    });
    return txHash;
  } catch (err) {
    console.error(`[market-creator] Failed to create claim:`, err);
    return null;
  }
}

// ── Main run ──────────────────────────────────────────────────────────────────

async function run(): Promise<void> {
  const [okb, usdc] = await Promise.all([
    publicClient.getBalance({ address: CREATOR_ADDR }),
    getUsdcBalance(CREATOR_WALLET),
  ]);

  console.log(`\n[market-creator] ── Run at ${new Date().toISOString()}`);
  console.log(`[market-creator] Creator    : ${CREATOR_ADDR}`);
  console.log(`[market-creator] OKB (gas)  : ${(Number(okb) / 1e18).toFixed(4)} OKB`);
  console.log(`[market-creator] USDC stake : ${microToUsdc(usdc).toFixed(2)} USDC`);

  // Fetch source data in parallel
  console.log("[market-creator] Fetching World Cup data...");
  const [worldCup, fixtures, topScorer] = await Promise.all([
    fetchWorldCupOverview(),
    fetchUpcomingSoccer(),
    fetchTopScorerMarket(),
  ]);

  console.log("[market-creator] Drafting World Cup claim candidates with LLM...");
  const candidates = await draftClaimCandidates({ worldCup, fixtures, topScorer });

  if (candidates.length === 0) {
    console.log("[market-creator] No high-quality candidates this run.");
    return;
  }

  console.log(`[market-creator] ${candidates.length} candidates (score ≥ ${MIN_QUALITY_SCORE}):`);
  candidates.forEach((c, i) => {
    console.log(`  ${i + 1}. [${c.qualityScore}] ${c.question.slice(0, 70)}...`);
  });

  let created = 0;
  for (const candidate of candidates.slice(0, MAX_CLAIMS_PER_RUN)) {
    console.log(`\n[market-creator] Creating: "${candidate.question.slice(0, 60)}..."`);
    const txHash = await createClaim(candidate);
    if (txHash) {
      console.log(`[market-creator] ✓ Created — ${getExplorerTxUrl(txHash)}`);
      created++;
    }
    // Brief pause between claims to avoid nonce issues
    await new Promise((r) => setTimeout(r, 2000));
  }

  console.log(`\n[market-creator] Created ${created}/${candidates.length} markets this run.`);
}

// ── Entry point ───────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const [okb, usdc] = await Promise.all([
    publicClient.getBalance({ address: CREATOR_ADDR }),
    getUsdcBalance(CREATOR_WALLET),
  ]);

  console.log("═══════════════════════════════════════════════");
  console.log("  Mimir Market Creator Agent (X Layer signer)");
  console.log(`  Creator    : ${CREATOR_ADDR}`);
  console.log(`  Wallet ID  : ${CREATOR_WALLET}`);
  console.log(`  OKB (gas)  : ${(Number(okb) / 1e18).toFixed(4)} OKB`);
  console.log(`  USDC stake : ${microToUsdc(usdc).toFixed(2)} USDC`);
  console.log(`  Network    : X Layer Testnet (${arcTestnet.id})`);
  console.log(`  LLM        : ${activeLLMProvider()} / ${activeLLMModel()}`);
  console.log(`  Stake/mkt  : ${CREATOR_STAKE_USDC} USDC`);
  console.log(`  Max/run    : ${MAX_CLAIMS_PER_RUN} claims`);
  console.log(`  Interval   : every ${RUN_INTERVAL_HOURS}h`);
  console.log("═══════════════════════════════════════════════\n");

  const safeRun = async () => {
    try {
      await run();
    } catch (err) {
      console.error("[market-creator] Run failed, will retry next interval:", err);
    }
  };

  await safeRun();
  setInterval(safeRun, RUN_INTERVAL_HOURS * 3600 * 1000);
}

main().catch((err) => {
  console.error("[market-creator] Fatal:", err);
  process.exit(1);
});
