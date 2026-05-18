/**
 * End-to-end demo of the full Mimir cycle on X Layer Testnet with Gemini settling.
 *
 *   1. market-creator wallet → approve USDC + createClaim (2 USDC stake, 150s deadline)
 *   2. oracle wallet         → approve USDC + challengeClaim (2 USDC counter-stake)
 *   3. wait for deadline
 *   4. oracle wallet (Gemini) → resolveClaim with on-chain payout
 *
 * Run: npx tsx --env-file-if-exists=.env.local scripts/demo-full-cycle.ts
 */

import { keccak256, toBytes, decodeEventLog } from "viem";
import {
  createArcPublicClient, getContractAddress, getExplorerTxUrl, weiToOkb, usdcToMicro,
  getUsdcAddress, ERC20_MIN_ABI,
} from "../lib/arc";
import {
  executeContract, buildAbiFunctionSignature, toCircleAbiParameters,
  ensureUsdcAllowance,
  getOracleWalletId, getOracleAddress,
  getMarketCreatorWalletId, getMarketCreatorAddress,
} from "../lib/circle-w3s";
import { callLLM, activeLLMProvider, activeLLMModel } from "../lib/llm";
import { MIMIR_ABI, STATE, WINNER_SIDE } from "../lib/mimir-abi";

// Deadline must be ≥ CHALLENGE_LOCK_SECONDS (60s) after the challenge tx lands.
// We pad to 180s so the create+approve+challenge txs (~30s on testnet) all land
// well outside the lock window.
const DEADLINE_SECONDS = 180;
const STAKE_USDC       = 1; // matches MIN_STAKE on the deployed contract
const SIG_CREATE       = buildAbiFunctionSignature("createClaim",     MIMIR_ABI);
const SIG_CHALLENGE    = buildAbiFunctionSignature("challengeClaim",  MIMIR_ABI);
const SIG_RESOLVE      = buildAbiFunctionSignature("resolveClaim",    MIMIR_ABI);

async function main(): Promise<void> {
  const client          = createArcPublicClient();
  const contractAddress = getContractAddress();
  const oracleWallet    = getOracleWalletId();
  const oracleAddr      = getOracleAddress();
  const creatorWallet   = getMarketCreatorWalletId();
  const creatorAddr     = getMarketCreatorAddress();

  console.log("─── Mimir full-cycle demo ───");
  console.log(`Contract: ${contractAddress}`);
  console.log(`LLM     : ${activeLLMProvider()} / ${activeLLMModel()}`);
  console.log(`Creator : ${creatorAddr}`);
  console.log(`Oracle  : ${oracleAddr}`);

  const stakeWei = usdcToMicro(STAKE_USDC);
  const deadline = BigInt(Math.floor(Date.now() / 1000) + DEADLINE_SECONDS);

  // 1. CREATE — creator approves USDC then opens the claim
  console.log(`\n[1/4] Creating claim (deadline in ${DEADLINE_SECONDS}s)…`);
  const approveCreate = await ensureUsdcAllowance(creatorWallet, contractAddress, stakeWei);
  if (approveCreate) console.log(`     approve   : ${getExplorerTxUrl(approveCreate)}`);
  const createTx = await executeContract({
    walletId:             creatorWallet,
    contractAddress,
    abiFunctionSignature: SIG_CREATE,
    abiParameters: toCircleAbiParameters([
      "Mimir demo — is the Bitcoin price > $100,000 USD?",
      "Yes, BTC > $100k",
      "No, BTC < $100k",
      "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd",
      deadline,
      stakeWei,
      "crypto",
      0n, "binary", "pool", 0n, "",
      "Settle from CoinGecko BTC USD spot price at deadline",
      100n, false, "",
    ]),
    refId:  `demo-create-${Date.now()}`,
  });
  console.log(`     create tx: ${getExplorerTxUrl(createTx)}`);

  // Read the new claim id from the ClaimCreated event in the receipt — this is
  // deterministic and immune to RPC-replica lag on claimCount().
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
  console.log(`     claim id : #${claimId}`);

  // 2. CHALLENGE — oracle stakes on the opposite side
  console.log(`\n[2/4] Oracle challenges (stakes ${STAKE_USDC} USDC on Side B)…`);
  const approveChallenge = await ensureUsdcAllowance(oracleWallet, contractAddress, stakeWei);
  if (approveChallenge) console.log(`     approve   : ${getExplorerTxUrl(approveChallenge)}`);
  const challengeTx = await executeContract({
    walletId:             oracleWallet,
    contractAddress,
    abiFunctionSignature: SIG_CHALLENGE,
    abiParameters:        toCircleAbiParameters([BigInt(claimId), stakeWei, ""]),
    refId:                `demo-challenge-${claimId}`,
  });
  console.log(`     challenge tx: ${getExplorerTxUrl(challengeTx)}`);

  // 3. WAIT — sleep until ~20s PAST the on-chain deadline so the chain's
  // block.timestamp is comfortably ≥ deadline when we send resolveClaim.
  const padSeconds = 20;
  const waitUntilMs = Number(deadline) * 1000 + padSeconds * 1000;
  const waitMs = Math.max(0, waitUntilMs - Date.now());
  console.log(`\n[3/4] Waiting ${Math.ceil(waitMs / 1000)}s for deadline…`);
  await new Promise((r) => setTimeout(r, waitMs));

  // Confirm state is ACTIVE and deadline passed
  const claim = await client.readContract({
    address: contractAddress, abi: MIMIR_ABI, functionName: "getClaim", args: [BigInt(claimId)],
  }) as readonly any[];
  const stateNow = Number(claim[9]);
  console.log(`     state    : ${stateNow} (1=ACTIVE expected)`);
  if (stateNow !== STATE.ACTIVE) throw new Error("Claim not ACTIVE — challenge may have failed");

  // 4. RESOLVE — Gemini evaluates evidence, oracle calls resolveClaim
  console.log("\n[4/4] Fetching evidence + asking Gemini for verdict…");
  const evidenceUrl = claim[4] as string;
  const evidence = await fetchEvidence(evidenceUrl);
  console.log(`     evidence : ${evidence.slice(0, 120)}…`);

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
  const verdict = JSON.parse(match[0]) as { verdict: keyof typeof WINNER_SIDE | string; confidence: number; explanation: string };
  console.log(`     verdict  : ${verdict.verdict} (${verdict.confidence}%)`);
  console.log(`     reason   : ${verdict.explanation}`);

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
    refId: `demo-resolve-${claimId}`,
  });
  console.log(`     resolve tx: ${getExplorerTxUrl(resolveTx)}`);

  // Post-state — balances in both gas (OKB) and stake (USDC) units
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
  console.log("\n✓ Full Mimir cycle on X Layer executed end-to-end (viem + Gemini + USDC stakes).");
}

async function fetchEvidence(url: string): Promise<string> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mimir-Demo/1.0" }, signal: AbortSignal.timeout(15_000) });
    const txt = await res.text();
    return txt.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 6000);
  } catch (e: any) {
    return `(failed to fetch ${url}: ${e?.message ?? "unknown"})`;
  }
}

main().catch((e) => { console.error("\nDemo failed:", e?.message ?? e); process.exit(1); });
