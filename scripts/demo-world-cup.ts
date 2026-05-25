/**
 * World Cup demo cycle on X Layer Testnet — for the X Cup Hackathon submission.
 *
 *   1. market-creator wallet → approve USDC + createClaim (1 USDC stake, ~3 min deadline)
 *   2. oracle wallet         → approve USDC + challengeClaim (1 USDC counter-stake)
 *   3. wait for deadline
 *   4. oracle wallet (LLM)   → resolveClaim with on-chain payout + evidenceHash
 *
 * At the end the script prints a ready-to-paste Markdown block of all four
 * OKLink tx URLs — drop it into README.md under "Live proof on X Layer".
 *
 * Run: npx tsx --env-file-if-exists=.env.local scripts/demo-world-cup.ts
 */

import { keccak256, toBytes, decodeEventLog } from "viem";
import {
  createArcPublicClient,
  getContractAddress,
  getExplorerTxUrl,
  weiToOkb,
  usdcToMicro,
  getUsdcAddress,
  ERC20_MIN_ABI,
} from "../lib/arc";
import {
  executeContract,
  buildAbiFunctionSignature,
  toCircleAbiParameters,
  ensureUsdcAllowance,
  getOracleWalletId,
  getOracleAddress,
  getMarketCreatorWalletId,
  getMarketCreatorAddress,
} from "../lib/circle-w3s";
import { callLLM, activeLLMProvider, activeLLMModel } from "../lib/llm";
import { MIMIR_ABI, STATE, WINNER_SIDE } from "../lib/mimir-abi";

// Deadline ≥ CHALLENGE_LOCK_SECONDS (60s) after the challenge tx lands.
// Pad to 180s so create+approve+challenge txs (~30s on testnet) settle well
// outside the lock window.
const DEADLINE_SECONDS = 180;
const STAKE_USDC       = 1;
const SIG_CREATE       = buildAbiFunctionSignature("createClaim",     MIMIR_ABI);
const SIG_CHALLENGE    = buildAbiFunctionSignature("challengeClaim",  MIMIR_ABI);
const SIG_RESOLVE      = buildAbiFunctionSignature("resolveClaim",    MIMIR_ABI);

// World Cup themed claim with a verifiable, publicly-confirmed answer so the
// LLM reaches a definitive verdict and the demo cycle produces a clean RESOLVED
// claim instead of UNRESOLVABLE.
const CLAIM = {
  question:        "Will the 2026 FIFA World Cup be hosted jointly by the United States, Canada, and Mexico?",
  creatorPosition: "Yes — USA, Canada, and Mexico are the confirmed joint hosts",
  counterPosition: "No — at least one of those three is not a host",
  resolutionUrl:   "https://en.wikipedia.org/wiki/2026_FIFA_World_Cup",
  category:        "sports",
  settlementRule:  "Resolve CREATOR_WINS if the source confirms USA, Canada, and Mexico are the three joint host nations of the 2026 FIFA World Cup. Resolve CHALLENGERS_WIN otherwise.",
};

async function main(): Promise<void> {
  const client          = createArcPublicClient();
  const contractAddress = getContractAddress();
  const oracleWallet    = getOracleWalletId();
  const oracleAddr      = getOracleAddress();
  const creatorWallet   = getMarketCreatorWalletId();
  const creatorAddr     = getMarketCreatorAddress();

  console.log("─── Mimir World Cup demo cycle ───");
  console.log(`Contract: ${contractAddress}`);
  console.log(`LLM     : ${activeLLMProvider()} / ${activeLLMModel()}`);
  console.log(`Creator : ${creatorAddr}`);
  console.log(`Oracle  : ${oracleAddr}`);
  console.log(`\nQuestion: ${CLAIM.question}`);
  console.log(`Source  : ${CLAIM.resolutionUrl}`);

  const stakeWei = usdcToMicro(STAKE_USDC);
  const deadline = BigInt(Math.floor(Date.now() / 1000) + DEADLINE_SECONDS);

  // 1. CREATE
  console.log(`\n[1/4] Creating claim (deadline in ${DEADLINE_SECONDS}s)…`);
  const approveCreate = await ensureUsdcAllowance(creatorWallet, contractAddress, stakeWei);
  if (approveCreate) console.log(`     approve   : ${getExplorerTxUrl(approveCreate)}`);
  const createTx = await executeContract({
    walletId:             creatorWallet,
    contractAddress,
    abiFunctionSignature: SIG_CREATE,
    abiParameters: toCircleAbiParameters([
      CLAIM.question,
      CLAIM.creatorPosition,
      CLAIM.counterPosition,
      CLAIM.resolutionUrl,
      deadline,
      stakeWei,
      CLAIM.category,
      0n, "binary", "pool", 0n, "",
      CLAIM.settlementRule,
      100n, false, "",
    ]),
    refId:  `wc-demo-create-${Date.now()}`,
  });
  console.log(`     create tx : ${getExplorerTxUrl(createTx)}`);

  const receipt = await client.getTransactionReceipt({ hash: createTx });
  let claimId = 0;
  for (const log of receipt.logs) {
    try {
      const decoded = decodeEventLog({
        abi: MIMIR_ABI,
        data: log.data,
        topics: log.topics,
      });
      if (decoded.eventName === "ClaimCreated") {
        claimId = Number((decoded.args as { id: bigint }).id);
        break;
      }
    } catch {
      /* not a Mimir event */
    }
  }
  if (claimId === 0) throw new Error("ClaimCreated event not found in receipt");
  console.log(`     claim id  : #${claimId}`);

  // X Layer testnet RPC is load-balanced across replicas — the gas-estimator
  // for the next tx may land on a node that hasn't synced our create tx yet,
  // causing the challenge call to revert with "claim not found". Poll the
  // read endpoint until the claim is visible to defeat the lag.
  process.stdout.write("     waiting for RPC propagation…");
  let visible = false;
  for (let i = 0; i < 15; i++) {
    try {
      const probe = (await client.readContract({
        address: contractAddress,
        abi: MIMIR_ABI,
        functionName: "getClaim",
        args: [BigInt(claimId)],
      })) as readonly any[];
      const creator = probe[0] as string;
      if (creator && creator !== "0x0000000000000000000000000000000000000000") {
        visible = true;
        break;
      }
    } catch { /* swallow */ }
    process.stdout.write(".");
    await new Promise((r) => setTimeout(r, 2000));
  }
  if (!visible) throw new Error(`Claim #${claimId} not visible after 30s — RPC replica lag persists`);
  process.stdout.write(" ✓\n");

  // 2. CHALLENGE
  console.log(`\n[2/4] Oracle challenges (stakes ${STAKE_USDC} USDC on Side B)…`);
  const approveChallenge = await ensureUsdcAllowance(oracleWallet, contractAddress, stakeWei);
  if (approveChallenge) console.log(`     approve   : ${getExplorerTxUrl(approveChallenge)}`);
  const challengeTx = await executeContract({
    walletId:             oracleWallet,
    contractAddress,
    abiFunctionSignature: SIG_CHALLENGE,
    abiParameters:        toCircleAbiParameters([BigInt(claimId), stakeWei, ""]),
    refId:                `wc-demo-challenge-${claimId}`,
  });
  console.log(`     challenge tx: ${getExplorerTxUrl(challengeTx)}`);

  // 3. WAIT
  const padSeconds = 20;
  const waitUntilMs = Number(deadline) * 1000 + padSeconds * 1000;
  const waitMs = Math.max(0, waitUntilMs - Date.now());
  console.log(`\n[3/4] Waiting ${Math.ceil(waitMs / 1000)}s for deadline…`);
  await new Promise((r) => setTimeout(r, waitMs));

  const claim = await client.readContract({
    address: contractAddress, abi: MIMIR_ABI, functionName: "getClaim", args: [BigInt(claimId)],
  }) as readonly any[];
  const stateNow = Number(claim[9]);
  console.log(`     state     : ${stateNow} (1=ACTIVE expected)`);
  if (stateNow !== STATE.ACTIVE) throw new Error("Claim not ACTIVE — challenge may have failed");

  // 4. RESOLVE
  console.log("\n[4/4] Fetching evidence + asking LLM for verdict…");
  const evidenceUrl = claim[4] as string;
  const evidence = await fetchEvidence(evidenceUrl);
  console.log(`     evidence  : ${evidence.slice(0, 120)}…`);

  const prompt = `You are Mimir, an impartial AI oracle for a prediction market.

Claim: ${claim[1]}
Side A (creator): ${claim[2]}
Side B (challenger): ${claim[3]}
Resolution source: ${evidenceUrl}
Settlement rule: ${claim[11] || "Use the resolution source to decide."}

Evidence fetched from the source:
<evidence>
${evidence}
</evidence>

Return JSON only:
{ "verdict": "CREATOR_WINS" | "CHALLENGERS_WIN" | "DRAW" | "UNRESOLVABLE",
  "confidence": <0-100>,
  "explanation": "<one sentence>" }`;

  const text = await callLLM(prompt, { maxTokens: 512, jsonOnly: true });
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`LLM did not return JSON: ${text.slice(0, 200)}`);
  const verdict = JSON.parse(match[0]) as {
    verdict: keyof typeof WINNER_SIDE | string;
    confidence: number;
    explanation: string;
  };
  console.log(`     verdict   : ${verdict.verdict} (${verdict.confidence}%)`);
  console.log(`     reason    : ${verdict.explanation}`);

  const sideMap: Record<string, number> = {
    CREATOR_WINS:    WINNER_SIDE.CREATOR,
    CHALLENGERS_WIN: WINNER_SIDE.CHALLENGERS,
    DRAW:            WINNER_SIDE.DRAW,
    UNRESOLVABLE:    WINNER_SIDE.UNRESOLVABLE,
  };
  const side = sideMap[verdict.verdict] ?? WINNER_SIDE.UNRESOLVABLE;
  const evidenceHash = keccak256(toBytes(evidence));

  console.log("     submitting resolveClaim…");
  const resolveTx = await executeContract({
    walletId:             oracleWallet,
    contractAddress,
    abiFunctionSignature: SIG_RESOLVE,
    abiParameters: toCircleAbiParameters([
      BigInt(claimId),
      side,
      verdict.explanation.slice(0, 400),
      Math.max(0, Math.min(100, Math.round(verdict.confidence ?? 50))),
      evidenceHash,
    ]),
    refId: `wc-demo-resolve-${claimId}`,
  });
  console.log(`     resolve tx: ${getExplorerTxUrl(resolveTx)}`);

  // Post-state
  const final = await client.readContract({
    address: contractAddress, abi: MIMIR_ABI, functionName: "getClaim", args: [BigInt(claimId)],
  }) as readonly any[];
  const finalState = Number(final[9]);
  const winnerSide = Number(final[10]);
  const usdcAddr = getUsdcAddress();
  const readUsdc = (a: `0x${string}`) =>
    client.readContract({
      address: usdcAddr,
      abi: ERC20_MIN_ABI,
      functionName: "balanceOf",
      args: [a],
    }) as Promise<bigint>;

  const [oracleOkb, creatorOkb, oracleUsdc, creatorUsdc] = await Promise.all([
    client.getBalance({ address: oracleAddr }),
    client.getBalance({ address: creatorAddr }),
    readUsdc(oracleAddr),
    readUsdc(creatorAddr),
  ]);

  console.log("\n─── Final state ───");
  console.log(`Claim #${claimId} state: ${finalState === STATE.RESOLVED ? "RESOLVED" : finalState}`);
  console.log(`Winner side          : ${winnerSide} (1=creator, 2=challengers, 3=draw, 4=unresolvable)`);
  console.log(`Oracle  OKB / USDC   : ${weiToOkb(oracleOkb).toFixed(4)} OKB / ${(Number(oracleUsdc) / 1e6).toFixed(2)} USDC`);
  console.log(`Creator OKB / USDC   : ${weiToOkb(creatorOkb).toFixed(4)} OKB / ${(Number(creatorUsdc) / 1e6).toFixed(2)} USDC`);

  // README-ready markdown block
  console.log("\n─── Paste this into README.md ───\n");
  console.log("```markdown");
  console.log(`**Claim #${claimId}** — *${CLAIM.question}*`);
  console.log("");
  console.log(`- Verdict: \`${verdict.verdict}\` (${verdict.confidence}% confidence)`);
  console.log(`- Evidence hash: \`${evidenceHash}\``);
  console.log(`- Source: ${CLAIM.resolutionUrl}`);
  console.log("");
  console.log("| Step | Tx |");
  console.log("|---|---|");
  console.log(`| Create | [\`${createTx.slice(0, 10)}…\`](${getExplorerTxUrl(createTx)}) |`);
  console.log(`| Challenge | [\`${challengeTx.slice(0, 10)}…\`](${getExplorerTxUrl(challengeTx)}) |`);
  console.log(`| Resolve | [\`${resolveTx.slice(0, 10)}…\`](${getExplorerTxUrl(resolveTx)}) |`);
  console.log("```");
  console.log("\n✓ Full Mimir cycle on X Layer executed end-to-end (viem + LLM + USDC stakes).");
}

async function fetchEvidence(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mimir-Demo/1.0" },
      signal: AbortSignal.timeout(15_000),
    });
    const txt = await res.text();
    return txt
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 6000);
  } catch (e: any) {
    return `(failed to fetch ${url}: ${e?.message ?? "unknown"})`;
  }
}

main().catch((e) => {
  console.error("\nDemo failed:", e?.message ?? e);
  process.exit(1);
});
