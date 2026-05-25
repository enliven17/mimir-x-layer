# Glossary — Mimir terminology

A reference for the project-specific vocabulary used in code, README, and the UI.

## Core concepts

**Claim**
A single, verifiable yes/no (or A/B) question with a deadline and a designated resolution URL. The unit of trade. Created on-chain via `createClaim()`. Has a state machine: `OPEN → ACTIVE → RESOLVED` (or `CANCELLED`).

**Creator**
The address that calls `createClaim()` and stakes USDC on one side. Defines the question, positions, deadline, evidence source, and settlement rule.

**Challenger**
An address that calls `challengeClaim()` and stakes USDC on the opposite side. A claim may have up to `MAX_CHALLENGERS = 100` of them.

**Oracle**
The single address authorized to call `resolveClaim()`. In production this is a long-lived Node worker ([agents/oracle/index.ts](../agents/oracle/index.ts)) that polls every 60s. The address is set in the contract at deploy time and changeable only by `owner`.

**Settlement rule**
A natural-language string stored on the claim that tells the oracle how to interpret the evidence (e.g., *"Resolve YES if BTC closes above $95k on CoinGecko at the deadline."*). The LLM is given this rule alongside the fetched evidence.

**Evidence hash**
`keccak256(rawEvidence)` — committed on-chain in `resolveClaim()`. Anyone can re-fetch the resolution URL, hash the bytes, and verify it matches what the oracle saw. This is Mimir's verifiability primitive.

**Verdict / winner side**
The LLM's structured answer: `CREATOR_WINS | CHALLENGERS_WIN | DRAW | UNRESOLVABLE`. Encoded on-chain as `SIDE_CREATOR=1 | SIDE_CHALLENGERS=2 | SIDE_DRAW=3 | SIDE_UNRESOLVABLE=4`.

**Confidence**
LLM-reported 0–100 score returned with each verdict. By policy, anything < 60 is force-downgraded to `UNRESOLVABLE` (refund both sides) by the off-chain agent before submission. Stored on-chain as `uint8`.

## Market types

**Pool odds (`oddsMode = "pool"`)**
Challengers split the creator's stake pro-rata to their own stake. Default mode.

**Fixed odds (`oddsMode = "fixed"`)**
Each challenger gets a fixed BPS payout (e.g., `20_000 = 2x`). The creator reserves liability up front; remaining capital is refunded if not all challenger slots fill.

**Anti-sniping window (`CHALLENGE_LOCK_SECONDS = 60`)**
No new challenges accepted in the final 60s before a claim's deadline. Stops late-information actors from waiting to see the outcome and slipping in a zero-risk bet.

**Rematch**
A new claim that inherits all configurable fields (question, positions, URL, etc.) from a parent claim via `createRematch(parentId, ...)`. Used for re-running the same bet under a new deadline.

**Private claim**
A claim with `isPrivate = true` and a non-zero `inviteKeyHash`. Only addresses presenting the matching invite key in `challengeClaim` can join. Used for friend-to-friend or league-mode bets.

## Agents

**Oracle agent** (`agents/oracle/index.ts`)
The settler. Reads `state == ACTIVE && deadline <= now` claims, fetches evidence, asks the LLM, submits `resolveClaim()`. With `AUTO_CHALLENGE=1` also stakes USDC against open claims it believes are mispriced (Kelly-sized).

**Market-creator agent** (`agents/market-creator/index.ts`)
The author. Every 6h pulls FIFA World Cup 2026 fixtures + news, drafts claim candidates via LLM, scores them, opens the top ones with creator-side USDC stake.

**Pundit agent** (`agents/pundit/index.ts`)
The football commentator persona. Every 2h scans open sport claims, runs an independent pre-event analysis (form, H2H, injuries), and stakes USDC on the side it disagrees with — also writing a public "hot take" per pick. Every `PUNDIT_CREATE_EVERY_HOURS` (default 8) it opens one of its own opinionated markets.

**Hot take**
A short public string the pundit writes alongside each challenge. Stored off-chain in Postgres (the `pundit_picks` table), surfaced on the agents page. Different from the on-chain `summary` an oracle writes at resolution.

**Kelly sizing**
Position sizing rule used by the oracle's auto-challenge mode. Stakes a fraction of the agent's bankroll proportional to its edge (`confidence% - implied probability`) so a single bad call doesn't wipe the wallet.

## Tokens & currency

**OKB**
Native gas token of X Layer (18 decimals). Every tx the agents send pays OKB for gas. The agents' OKB balance is monitored on the `/agents` page.

**USDC_TEST**
The ERC-20 stablecoin on X Layer Testnet (6 decimals) used for all stakes and payouts. Address: `0xcB8BF24c6cE16Ad21D707c9505421a17f2bec79D`. Not interchangeable with mainnet USDC.

**Micro**
The internal name for "6-decimal USDC units" — e.g., `1_000_000n` micro = `1 USDC`. The helpers `usdcToMicro` / `microToUsdc` live in [lib/xlayer.ts](../lib/xlayer.ts).

**Allowance / approve**
Because USDC is ERC-20, every stake requires a prior `usdc.approve(Mimir, amount)` so the contract can `transferFrom`. Agents call `ensureUsdcAllowance` once with `maxUint256` so subsequent stakes need no re-approval.

## Storage

**Read-index** (Neon Postgres)
A denormalised cache of on-chain claim state, populated by polling. Optional — the contract is always the source of truth, the index is for fast list queries. See `lib/server/vs-index.ts`.

**`pundit_picks` table**
Off-chain storage for the pundit agent's hot takes and rationale. Joined into the claim feed by `claimId`.

## Chain references

**X Layer Testnet** — OKX's zkEVM L2 (Polygon CDK). Chain id `1952`. The hackathon's deployment target. Mainnet is `196`; Mimir does not deploy there.

**Legacy EIP-155 tx** — X Layer Testnet rejects EIP-1559 (type 2) transactions. All Mimir signers (`deploy/deploy.ts`, [lib/circle-w3s.ts](../lib/circle-w3s.ts)) sign legacy EIP-155 with the chain id baked into the signature.

**OKLink** — the X Layer block explorer at <https://www.oklink.com/xlayer-test>. Where the Mimir contract is verified.
