/**
 * Mimir Pundit Agent — AI sports commentator on X Layer
 *
 * The third autonomous agent in the Mimir stack. Its job: bring independent
 * football knowledge to the order book. Two on-chain actions:
 *
 *   1. CHALLENGE — scans OPEN sport claims, picks the side it disagrees with
 *      (with confidence ≥ PUNDIT_CONFIDENCE), and stakes USDC on that side.
 *   2. CREATE   — every PUNDIT_CREATE_EVERY_HOURS the pundit also opens its
 *      own opinionated market ("Spain to top Group D", etc.).
 *
 * Differentiator from the oracle's auto-challenger:
 *   - Auto-challenger reacts to the oracle's evidence-reading LLM output.
 *   - Pundit brings independent pre-event analysis (form, H2H, injuries,
 *     narrative) and writes a public hot-take per pick.
 *
 * API-call budget (intentionally cheap):
 *   - Wakes every PUNDIT_INTERVAL_HOURS (default 2h → 12 runs / day)
 *   - Each run batches the candidate claims into ONE Gemini call
 *   - Filters: only category in {match, groupstage, knockout, playerprop,
 *     topscorer, tournament}, deadline > 2h away, never seen before (DB-checked)
 *   - Max PUNDIT_MAX_PICKS_PER_RUN (default 3) on-chain actions per run
 *
 * Run: npx tsx agents/pundit/index.ts
 * Env: PUNDIT_PRIVATE_KEY, NEXT_PUBLIC_CONTRACT_ADDRESS, DATABASE_URL,
 *      GEMINI_API_KEY (or ANTHROPIC_API_KEY).
 *
 * Stakes are denominated in USDC (USDC_TEST, 6 decimals). Gas in OKB.
 */

import { callLLM, activeLLMProvider, activeLLMModel } from "../../lib/llm";
import {
  createArcPublicClient,
  arcTestnet,
  getContractAddress,
  getExplorerTxUrl,
  microToUsdc,
  usdcToMicro,
} from "../../lib/arc";
import {
  executeContract,
  buildAbiFunctionSignature,
  toCircleAbiParameters,
  ensureUsdcAllowance,
  getUsdcBalance,
  getPunditWalletId,
  getPunditAddress,
} from "../../lib/circle-w3s";
import { MIMIR_ABI, STATE } from "../../lib/mimir-abi";
import {
  insertPunditPick,
  getPunditCoveredClaimIds,
  getLastPunditCreateMs,
} from "../../lib/db";

// ── Config ────────────────────────────────────────────────────────────────────
const CONTRACT_ADDRESS         = getContractAddress();
const PUNDIT_STAKE_USDC        = Number(process.env.PUNDIT_STAKE_USDC ?? "2");
const PUNDIT_CONFIDENCE        = Number(process.env.PUNDIT_CONFIDENCE ?? "75");
const PUNDIT_INTERVAL_HOURS    = Number(process.env.PUNDIT_INTERVAL_HOURS ?? "2");
const PUNDIT_MAX_PICKS_PER_RUN = Number(process.env.PUNDIT_MAX_PICKS_PER_RUN ?? "3");
const PUNDIT_CREATE_EVERY_HOURS = Number(process.env.PUNDIT_CREATE_EVERY_HOURS ?? "8");
const SPORT_CATEGORIES = new Set([
  "match", "groupstage", "knockout", "playerprop", "topscorer", "tournament",
]);

try {
  getPunditAddress();
} catch (err: any) {
  console.error(err?.message ?? err);
  process.exit(1);
}
if (!process.env.GEMINI_API_KEY?.trim() && !process.env.ANTHROPIC_API_KEY?.trim()) {
  console.error("GEMINI_API_KEY or ANTHROPIC_API_KEY env var is required");
  process.exit(1);
}
if (!process.env.DATABASE_URL?.trim()) {
  console.error("DATABASE_URL is required — the pundit logs every pick to Postgres");
  process.exit(1);
}

const SIG_CREATE_CLAIM    = buildAbiFunctionSignature("createClaim", MIMIR_ABI);
const SIG_CHALLENGE_CLAIM = buildAbiFunctionSignature("challengeClaim", MIMIR_ABI);

// ── Clients ───────────────────────────────────────────────────────────────────
const publicClient  = createArcPublicClient();
const PUNDIT_WALLET = getPunditWalletId();
const PUNDIT_ADDR   = getPunditAddress();

// ── Types ─────────────────────────────────────────────────────────────────────
interface ChainClaim {
  id:               number;
  creator:          string;
  question:         string;
  creatorPosition:  string;
  counterPosition:  string;
  resolutionUrl:    string;
  deadline:         bigint;
  state:            number;
  category:         string;
  settlementRule:   string;
  hasChallenger:    boolean;
}

interface PunditAnalysis {
  claimId:    number;
  pickSide:   "creator" | "counter" | "skip";
  confidence: number;
  hotTake:    string;
  reasoning:  string;
}

interface PunditCreation {
  question:        string;
  creatorPosition: string;
  counterPosition: string;
  resolutionUrl:   string;
  category:        string;
  settlementRule:  string;
  deadlineISO:     string;
  confidence:      number;
  hotTake:         string;
  reasoning:       string;
}

// ── Step 1: fetch open sport claims from chain ────────────────────────────────
async function fetchOpenSportClaims(): Promise<ChainClaim[]> {
  const total = (await publicClient.readContract({
    address:      CONTRACT_ADDRESS,
    abi:          MIMIR_ABI,
    functionName: "claimCount",
  })) as bigint;
  const max = Number(total);
  if (max === 0) return [];

  // Walk backwards from the newest claim; cap at 40 to stay polite. Active
  // sport markets are usually clustered at the top of the list.
  const SCAN_LIMIT = 40;
  const ids: number[] = [];
  for (let id = max; id > 0 && ids.length < SCAN_LIMIT; id--) ids.push(id);

  const nowSec = BigInt(Math.floor(Date.now() / 1000));
  const claims: ChainClaim[] = [];

  // Cheap parallel reads in batches of 8 — X Layer RPC handles this easily.
  for (let i = 0; i < ids.length; i += 8) {
    const slice = ids.slice(i, i + 8);
    const results = await Promise.all(
      slice.map((id) =>
        publicClient
          .readContract({
            address:      CONTRACT_ADDRESS,
            abi:          MIMIR_ABI,
            functionName: "getClaim",
            args:         [BigInt(id)],
          })
          .then((res) => ({ id, raw: res as any }))
          .catch(() => null),
      ),
    );

    for (const r of results) {
      if (!r) continue;
      const raw = r.raw;
      const state    = Number(raw.state ?? raw[9]);
      const deadline = BigInt(raw.deadline ?? raw[8]);
      const category = String(raw.category ?? raw[12] ?? "");
      const totalChallengerStake = BigInt(raw.totalChallengerStake ?? raw[6] ?? 0n);

      // Only OPEN and ACTIVE claims with deadline > 2 hours away are worth
      // analysing. (Less than 2h leaves no time for tx confirmation +
      // counter-action; less than 60s and the contract locks anyway.)
      if (state !== STATE.OPEN && state !== STATE.ACTIVE) continue;
      if (deadline <= nowSec + 7200n) continue;
      if (!SPORT_CATEGORIES.has(category)) continue;

      claims.push({
        id:               r.id,
        creator:          String(raw.creator ?? raw[0]),
        question:         String(raw.question ?? raw[1] ?? ""),
        creatorPosition:  String(raw.creatorPosition ?? raw[2] ?? ""),
        counterPosition:  String(raw.counterPosition ?? raw[3] ?? ""),
        resolutionUrl:    String(raw.resolutionUrl ?? raw[4] ?? ""),
        deadline,
        state,
        category,
        settlementRule:   String(raw.settlementRule ?? raw[19] ?? ""),
        hasChallenger:    totalChallengerStake > 0n,
      });
    }
  }

  return claims;
}

// ── Step 2: ask the LLM once for analysis on every candidate ──────────────────
// One prompt, N decisions = 1 API call per run (cheap on quota).
async function analyseClaims(claims: ChainClaim[]): Promise<PunditAnalysis[]> {
  if (claims.length === 0) return [];

  const list = claims
    .map((c, i) => {
      const deadlineISO = new Date(Number(c.deadline) * 1000).toISOString();
      return [
        `#${i + 1}  claim_id=${c.id}  category=${c.category}  deadline=${deadlineISO}`,
        `   question:           ${c.question}`,
        `   creator says (YES): ${c.creatorPosition}`,
        `   counter says (NO):  ${c.counterPosition}`,
        `   settlement rule:    ${c.settlementRule}`,
      ].join("\n");
    })
    .join("\n\n");

  const prompt = `You are "Pundit", an AI football commentator on Mimir — a USDC-staked prediction market on X Layer. You bring independent sports analysis (form, H2H, injuries, fixture context) to claims that other agents have opened.

For each claim below, decide whether you'd take the YES (creator) side, the NO (counter) side, or skip. Be honest — most claims should be "skip" because you don't have an edge. Only pick a side when you have a real, defensible thesis.

## Today's date
${new Date().toISOString()}

## Candidates
${list}

## Output
Return ONLY a JSON array, one entry per candidate, in the same order:

[
  {
    "claimId":    <integer claim_id>,
    "pickSide":   "creator" | "counter" | "skip",
    "confidence": <0-100>,
    "hotTake":    "<one snappy sentence, 140 chars max, broadcaster voice — e.g. 'Spain have kept clean sheets in 4 of their last 5 qualifiers; this is firm YES.'>",
    "reasoning":  "<2-3 short sentences with the actual football reasoning — form, key players, fixture context>"
  }
]

Rules:
- Set pickSide="skip" if you have no edge (lazy default — preserves capital).
- confidence < 70 → pickSide MUST be "skip" (we filter these out).
- hotTake is broadcaster-style: confident, short, no hedging language.
- Output JSON ONLY, no markdown fences.`;

  const text = await callLLM(prompt, { maxTokens: 2200, jsonOnly: true });
  try {
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) throw new Error("no JSON array in response");
    const raw = JSON.parse(match[0]) as PunditAnalysis[];
    return raw
      .filter((a) => Number.isFinite(a?.claimId) && typeof a.pickSide === "string")
      .map((a) => ({
        claimId:    Number(a.claimId),
        pickSide:   (a.pickSide === "creator" || a.pickSide === "counter") ? a.pickSide : "skip",
        confidence: Math.max(0, Math.min(100, Math.round(Number(a.confidence) || 0))),
        hotTake:    String(a.hotTake ?? "").trim().slice(0, 240),
        reasoning:  String(a.reasoning ?? "").trim().slice(0, 800),
      }));
  } catch (err) {
    console.warn("[pundit] Failed to parse analysis JSON:", err);
    return [];
  }
}

// ── Step 3a: act on a single challenge pick ───────────────────────────────────
async function executeChallenge(
  claim: ChainClaim,
  analysis: PunditAnalysis,
): Promise<string | null> {
  if (analysis.pickSide === "skip") return null;
  const stake = usdcToMicro(PUNDIT_STAKE_USDC);

  // pickSide="creator" would mean the pundit agrees with the creator → it
  // can't act, because challengeClaim only stakes on the counter side.
  // Skip and just log the take.
  if (analysis.pickSide === "creator") {
    console.log(`[pundit]   claim ${claim.id}: agrees with creator (no on-chain action)`);
    return null;
  }

  try {
    const approveTx = await ensureUsdcAllowance(PUNDIT_WALLET, CONTRACT_ADDRESS, stake);
    if (approveTx) console.log(`[pundit]   approve USDC — ${getExplorerTxUrl(approveTx)}`);

    const txHash = await executeContract({
      walletId:             PUNDIT_WALLET,
      contractAddress:      CONTRACT_ADDRESS,
      abiFunctionSignature: SIG_CHALLENGE_CLAIM,
      abiParameters:        toCircleAbiParameters([BigInt(claim.id), stake, ""]),
      refId:                `pundit-ch-${claim.id}-${Date.now()}`,
    });
    return txHash;
  } catch (err) {
    console.error(`[pundit] challenge failed for claim ${claim.id}:`, err);
    return null;
  }
}

// ── Step 3b: pundit-authored market (sparingly) ───────────────────────────────
async function draftPunditCreation(): Promise<PunditCreation | null> {
  const prompt = `You are "Pundit", an AI football commentator. Draft ONE binary, verifiable prediction market about FIFA World Cup 2026 or qualifying matches that you believe most other markets would mis-price.

Tournament: FIFA World Cup 2026, 11 Jun 2026 – 19 Jul 2026 (USA / Canada / Mexico).

## Today's date
${new Date().toISOString()}

## Requirements
- Binary YES/NO outcome.
- Resolvable from a single public URL (fifa.com, wikipedia.org/wiki/2026_FIFA_World_Cup, espn.com/soccer, sofascore.com).
- Pick a deadline strictly in the future (≥ 2 days from today), ideally just after the event the question is about.
- The market must reflect a genuine contrarian or sharp opinion — not a coin-flip.

## Output (JSON ONLY)
{
  "question":        "Will <specific thing> happen by <date>?",
  "creatorPosition": "Yes — <one-line thesis>",
  "counterPosition": "No — <one-line counter>",
  "resolutionUrl":   "https://...",
  "category":        "match" | "groupstage" | "knockout" | "playerprop" | "topscorer" | "tournament",
  "settlementRule":  "Resolve YES if <exact observable condition> at the resolution URL at deadline.",
  "deadlineISO":     "<ISO 8601 UTC, e.g. 2026-06-17T23:59:00Z>",
  "confidence":      <0-100>,
  "hotTake":         "<one broadcaster-voice sentence, 140 chars max>",
  "reasoning":       "<2-3 sentences with the actual football reasoning>"
}`;

  try {
    const text = await callLLM(prompt, { maxTokens: 900, jsonOnly: true });
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const c = JSON.parse(match[0]) as PunditCreation;

    const deadlineMs = Date.parse(c.deadlineISO);
    if (!Number.isFinite(deadlineMs)) return null;
    if (deadlineMs <= Date.now() + 2 * 86_400_000) return null; // must be > 2 days out
    if (deadlineMs > Date.now() + 120 * 86_400_000) return null; // < 120 days
    if (Number(c.confidence) < PUNDIT_CONFIDENCE) return null;
    return c;
  } catch (err) {
    console.warn("[pundit] Failed to draft creation:", err);
    return null;
  }
}

async function executeCreation(c: PunditCreation): Promise<string | null> {
  const deadline = BigInt(Math.floor(Date.parse(c.deadlineISO) / 1000));
  const stake    = usdcToMicro(PUNDIT_STAKE_USDC);

  try {
    const approveTx = await ensureUsdcAllowance(PUNDIT_WALLET, CONTRACT_ADDRESS, stake);
    if (approveTx) console.log(`[pundit]   approve USDC — ${getExplorerTxUrl(approveTx)}`);

    const txHash = await executeContract({
      walletId:             PUNDIT_WALLET,
      contractAddress:      CONTRACT_ADDRESS,
      abiFunctionSignature: SIG_CREATE_CLAIM,
      abiParameters: toCircleAbiParameters([
        c.question,
        c.creatorPosition,
        c.counterPosition,
        c.resolutionUrl,
        deadline,
        stake,
        c.category,
        BigInt(0),
        "binary",
        "pool",
        BigInt(0),
        "",
        c.settlementRule,
        BigInt(100),
        false,
        "",
      ]),
      refId: `pundit-cr-${Date.now()}`,
    });
    return txHash;
  } catch (err) {
    console.error("[pundit] creation failed:", err);
    return null;
  }
}

// ── Main run ──────────────────────────────────────────────────────────────────
async function run(): Promise<void> {
  const startedAt = Date.now();

  const [okb, usdc, covered] = await Promise.all([
    publicClient.getBalance({ address: PUNDIT_ADDR }),
    getUsdcBalance(PUNDIT_WALLET),
    getPunditCoveredClaimIds(),
  ]);

  console.log(`\n[pundit] ── Run at ${new Date().toISOString()}`);
  console.log(`[pundit] Pundit     : ${PUNDIT_ADDR}`);
  console.log(`[pundit] OKB (gas)  : ${(Number(okb) / 1e18).toFixed(4)} OKB`);
  console.log(`[pundit] USDC stake : ${microToUsdc(usdc).toFixed(2)} USDC`);
  console.log(`[pundit] Already covered: ${covered.size} claim(s)`);

  // Bail early if no funds — saves the LLM call.
  const minStake = usdcToMicro(PUNDIT_STAKE_USDC);
  if (usdc < minStake) {
    console.warn(`[pundit] Insufficient USDC for one stake (${microToUsdc(usdc).toFixed(2)} < ${PUNDIT_STAKE_USDC})`);
    return;
  }
  if (okb < 5n * 10n ** 15n) {
    console.warn(`[pundit] Insufficient OKB gas — top up ${PUNDIT_ADDR}`);
    return;
  }

  // ── Challenge pass ──────────────────────────────────────────────────────────
  const candidates = (await fetchOpenSportClaims())
    .filter((c) => !covered.has(c.id));
  console.log(`[pundit] ${candidates.length} fresh sport candidate(s) on chain`);

  let txCount = 0;
  if (candidates.length > 0) {
    // Cap the LLM input — never analyse more than 8 in one batch (token budget).
    const batch = candidates.slice(0, 8);
    const analyses = await analyseClaims(batch);

    const actionable = analyses
      .filter((a) => a.pickSide !== "skip" && a.confidence >= PUNDIT_CONFIDENCE)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, PUNDIT_MAX_PICKS_PER_RUN);

    console.log(`[pundit] ${actionable.length} actionable pick(s) ≥ ${PUNDIT_CONFIDENCE}% confidence`);

    for (const a of actionable) {
      const claim = batch.find((c) => c.id === a.claimId);
      if (!claim) continue;
      console.log(`\n[pundit] claim ${a.claimId} → ${a.pickSide} (${a.confidence}%)`);
      console.log(`[pundit]   hot take: ${a.hotTake}`);

      const txHash = await executeChallenge(claim, a);
      if (txHash) {
        console.log(`[pundit]   ✓ challenged — ${getExplorerTxUrl(txHash)}`);
        txCount++;
      }

      // Always log to DB, even when pickSide=creator (no on-chain tx) — the
      // public hot-take is part of the deliverable.
      await insertPunditPick({
        claimId:        a.claimId,
        actionType:     "challenge",
        pickSide:       a.pickSide as "creator" | "counter",
        confidence:     a.confidence,
        hotTake:        a.hotTake,
        reasoning:      a.reasoning,
        stakeMicroUsdc: txHash ? minStake : 0n,
        txHash:         txHash ?? "",
      });

      // Slight pause between txs to dodge nonce flakiness.
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  // ── Creation pass (rare) ────────────────────────────────────────────────────
  const lastCreateMs = await getLastPunditCreateMs();
  const sinceCreateHrs = lastCreateMs > 0
    ? (Date.now() - lastCreateMs) / 3_600_000
    : Infinity;

  if (sinceCreateHrs >= PUNDIT_CREATE_EVERY_HOURS) {
    console.log(`\n[pundit] Creation pass (${sinceCreateHrs === Infinity ? "first run" : sinceCreateHrs.toFixed(1) + "h since last create"})`);
    const draft = await draftPunditCreation();
    if (draft) {
      console.log(`[pundit]   draft: "${draft.question.slice(0, 70)}..."`);
      const txHash = await executeCreation(draft);
      if (txHash) {
        console.log(`[pundit]   ✓ created — ${getExplorerTxUrl(txHash)}`);
        txCount++;
        await insertPunditPick({
          claimId:        0, // unknown until indexer picks it up; 0 = self-created
          actionType:     "create",
          pickSide:       "creator",
          confidence:     draft.confidence,
          hotTake:        draft.hotTake,
          reasoning:      draft.reasoning,
          stakeMicroUsdc: minStake,
          txHash,
        });
      }
    } else {
      console.log("[pundit]   no draft passed quality bar this run");
    }
  } else {
    console.log(`\n[pundit] Skipping creation pass (${sinceCreateHrs.toFixed(1)}h / ${PUNDIT_CREATE_EVERY_HOURS}h)`);
  }

  console.log(`\n[pundit] Run done in ${((Date.now() - startedAt) / 1000).toFixed(1)}s — ${txCount} tx submitted`);
}

// ── Entry point ───────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const [okb, usdc] = await Promise.all([
    publicClient.getBalance({ address: PUNDIT_ADDR }),
    getUsdcBalance(PUNDIT_WALLET),
  ]);

  console.log("═══════════════════════════════════════════════");
  console.log("  Mimir Pundit Agent (X Layer signer)");
  console.log(`  Pundit       : ${PUNDIT_ADDR}`);
  console.log(`  OKB (gas)    : ${(Number(okb) / 1e18).toFixed(4)} OKB`);
  console.log(`  USDC stake   : ${microToUsdc(usdc).toFixed(2)} USDC`);
  console.log(`  Network      : X Layer Testnet (${arcTestnet.id})`);
  console.log(`  LLM          : ${activeLLMProvider()} / ${activeLLMModel()}`);
  console.log(`  Stake/pick   : ${PUNDIT_STAKE_USDC} USDC`);
  console.log(`  Min confid.  : ${PUNDIT_CONFIDENCE}`);
  console.log(`  Max picks/run: ${PUNDIT_MAX_PICKS_PER_RUN}`);
  console.log(`  Interval     : every ${PUNDIT_INTERVAL_HOURS}h`);
  console.log(`  Create every : ${PUNDIT_CREATE_EVERY_HOURS}h`);
  console.log("═══════════════════════════════════════════════\n");

  const safeRun = async () => {
    try {
      await run();
    } catch (err) {
      console.error("[pundit] Run failed, will retry next interval:", err);
    }
  };

  await safeRun();
  setInterval(safeRun, PUNDIT_INTERVAL_HOURS * 3600 * 1000);
}

main().catch((err) => {
  console.error("[pundit] Fatal:", err);
  process.exit(1);
});
