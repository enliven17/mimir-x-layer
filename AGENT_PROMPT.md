# Mimir — Full Project Context for AI Agent

You are being onboarded to the Mimir codebase. This document is self-contained — it includes architecture, source layout, types, and implementation status so you can work on this project without file access.

## What is Mimir?

Mimir is an **AI-settled prediction market** built on **X Layer Testnet** (OKX zkEVM L2, chain id `1952`). Users create verifiable claims about real-world outcomes (sports, crypto, weather, culture), stake **USDC** (an ERC-20 stablecoin on X Layer), and share a link for opponents to challenge. When the deadline arrives, the Mimir oracle agent:

1. Fetches live evidence from the web (the claim's `resolutionUrl`)
2. Evaluates the evidence via an LLM (Gemini 2.5 Flash or Claude Sonnet 4.6)
3. Sends a `resolveClaim()` transaction to X Layer with the verdict + `evidenceHash`
4. The winner is paid automatically in USDC — no committees, no disputes

**One-liner:** "An AI-settled claim market supporting head-to-head, 1-v-many, pool-odds, fixed-odds, and rivalry-linked rematches — settled in USDC on X Layer."

**License:** AGPL-3.0
**Default locale:** English (en)

## Tech stack

| Layer            | Technology                                                                |
| ---------------- | ------------------------------------------------------------------------- |
| Frontend         | Next.js 16 (App Router) + React 18 + TypeScript 5 + Tailwind CSS 3.4      |
| Animations       | Framer Motion 12                                                          |
| Blockchain       | X Layer Testnet (chain id `1952`), viem 2.47, wagmi 3                     |
| Smart contract   | Solidity 0.8.20 — `contracts/Mimir.sol`, compiled with solc 0.8.28 `viaIR` |
| Stake token      | `USDC_TEST` ERC-20 at `0xcB8BF24c6cE16Ad21D707c9505421a17f2bec79D` (6 decimals) |
| Gas              | Native OKB (18 decimals)                                                  |
| AI oracle        | `agents/oracle/index.ts` — Gemini or Claude via `lib/llm.ts`              |
| Messaging        | XMTP Browser SDK v7 (optional, E2E encrypted 1v1 chat)                    |
| i18n             | next-intl (English default)                                               |
| Auth             | MetaMask (EIP-1193) + demo relay fallback                                 |
| Database         | Neon Postgres (read-index cache, optional)                                |
| Frontend deploy  | Vercel                                                                    |
| Worker deploy    | Railway                                                                   |

## Project structure

```
mimir-x-layer/
├── app/                              Next.js 16 App Router
│   ├── layout.tsx                    Root layout with WalletProvider
│   └── [locale]/                     i18n routing
│       ├── page.tsx                  Home
│       ├── dashboard/                User dashboard
│       ├── explore/                  Browse open claims
│       ├── vs/                       Create + claim detail
│       └── messages/                 XMTP messages hub
├── agents/
│   ├── oracle/index.ts               Settler + auto-challenger
│   └── market-creator/index.ts       FIFA World Cup 2026 market drafter
├── contracts/Mimir.sol               The only contract
├── lib/
│   ├── xlayer.ts                     Chain config (chainId 1952)
│   ├── arc.ts                        Back-compat shim → xlayer.ts
│   ├── mimir-abi.ts                  ABI + state constants
│   ├── contract.ts                   TS client (read + write)
│   ├── circle-w3s.ts                 Legacy-named viem signer wrapper
│   ├── wagmi-config.ts               wagmi config for X Layer
│   └── llm.ts                        Provider-agnostic LLM call
├── deploy/deploy.ts                  Legacy EIP-155 deploy (no EIP-1559)
├── scripts/
│   ├── generate-wallets.ts
│   ├── compile-contract.ts
│   └── check-balances.ts
└── messages/en.json
```

## Environment variables

Public (browser-exposed):
- `NEXT_PUBLIC_CONTRACT_ADDRESS` — deployed `Mimir.sol`
- `NEXT_PUBLIC_DEPLOY_BLOCK` — for log scans
- `NEXT_PUBLIC_XLAYER_RPC` — RPC override
- `NEXT_PUBLIC_DEMO_MODE`, `NEXT_PUBLIC_DEMO_MODE_LABEL`
- `NEXT_PUBLIC_XMTP_ENV`, `NEXT_PUBLIC_FEATURE_XMTP`, `NEXT_PUBLIC_XMTP_APP_VERSION`

Server-only:
- `XLAYER_RPC` — server RPC override
- `DEPLOYER_PRIVATE_KEY` — deploy script only
- `ORACLE_PRIVATE_KEY`, `ORACLE_ADDRESS`
- `CREATOR_PRIVATE_KEY`, `CREATOR_ADDRESS`
- `GEMINI_API_KEY` or `ANTHROPIC_API_KEY`, optional `LLM_PROVIDER`
- `DATABASE_URL` (Neon, optional)

## Key npm scripts

```bash
npm run dev                # dev server
npm run build              # production build
npm run wallets:generate   # write wallets.local.json
npm run contract:compile   # solc 0.8.28 viaIR
npm run deploy:contract    # deploy to X Layer Testnet
npm run oracle             # AI oracle agent
npm run market-creator     # market-creator agent
npm run workers            # both agents (Railway entry point)
npm run test:smoke         # smoke tests
```

## Smart contract: Mimir.sol

Key constants:
- `MIN_STAKE = 1_000_000` — 1 USDC (6 decimals)
- `MAX_CHALLENGERS = 100`
- `CHALLENGE_LOCK_SECONDS = 60` — no new challenges in the final 60s before deadline
- `DEFAULT_PAYOUT_BPS = 20_000` — 2x for fixed odds

State values: `ST_OPEN=0`, `ST_ACTIVE=1`, `ST_RESOLVED=2`, `ST_CANCELLED=3`
Winner side: `SIDE_NONE=0`, `SIDE_CREATOR=1`, `SIDE_CHALLENGERS=2`, `SIDE_DRAW=3`, `SIDE_UNRESOLVABLE=4`

Stakes are ERC-20 USDC. Every write that takes a stake (`createClaim`, `challengeClaim`, `createRematch`) requires the caller to have previously called `usdc.approve(Mimir, stakeAmount)`. The contract pulls the stake via `usdc.transferFrom(msg.sender, address(this), stakeAmount)` and reverts if the allowance is too low.

Write functions:
```
createClaim(question, creatorPosition, counterPosition, resolutionUrl,
            deadline, stakeAmount, category, parentId, marketType, oddsMode,
            challengerPayoutBps, handicapLine, settlementRule, maxChallengers,
            isPrivate, inviteKey) → claimId

createRematch(parentId, deadline, stakeAmount, inviteKey) → claimId
challengeClaim(claimId, stakeAmount, inviteKey)
resolveClaim(claimId, winnerSide, summary, confidence, evidenceHash)  // oracle-only
cancelClaim(claimId)                                                    // creator + open only
```

Payouts: `CREATOR_WINS` → creator takes the pot. `CHALLENGERS_WIN (pool)` → pro-rata. `CHALLENGERS_WIN (fixed)` → fixed BPS payout, creator gets remainder. `DRAW` / `UNRESOLVABLE` → full refund. All payouts are USDC `transfer`s.

## X Layer chain config (`lib/xlayer.ts`)

```typescript
export const xLayerTestnet = {
  id: 1952,
  name: "X Layer Testnet",
  nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 },
  rpcUrls: { default: { http: ["https://testrpc.xlayer.tech"] } },
  blockExplorers: { default: { name: "OKLink", url: "https://www.oklink.com/xlayer-test" } },
};
```

X Layer Testnet rejects EIP-1559 transactions. Both `deploy/deploy.ts` and the agent signer in `lib/circle-w3s.ts` sign **legacy EIP-155** transactions (`signAndSendLegacy`).

## Oracle agent (`agents/oracle/index.ts`)

Off-chain TypeScript worker. Every 60 seconds:

1. Read `claimCount()`
2. For each claim with `state === ACTIVE` and `deadline <= now`:
   - Fetch `resolutionUrl`, strip HTML
   - Compute `evidenceHash = keccak256(rawEvidence)`
   - Call LLM with `{question, evidence, settlementRule}` → `{verdict, confidence, summary}`
   - Send `resolveClaim(claimId, side, summary, confidence, evidenceHash)` to X Layer
3. With `AUTO_CHALLENGE=1`, also scan OPEN claims and Kelly-size counter-stakes when its confidence ≥ `CHALLENGE_CONFIDENCE`. Each auto-challenge is a two-step `approve` + `challengeClaim`.

Signs every tx with viem using `ORACLE_PRIVATE_KEY`. Pays OKB for gas, USDC for auto-challenge stakes.

## Market-creator agent (`agents/market-creator/index.ts`)

Runs every 6 hours. Pulls FIFA World Cup 2026 fixtures, group standings, and news, asks the LLM to draft 1–5 verifiable claim candidates (each with a `resolutionUrl` pointing to fifa.com / ESPN / API-Sports), scores them, and opens the top ones. Each `createClaim` is preceded by `usdc.approve(Mimir, stake)`. Quality floor 70/100, cap 5 markets per run by default.

## Working rules

- `contracts/Mimir.sol` is the source of truth — keep `lib/mimir-abi.ts` and `lib/contract.ts` aligned.
- USDC is an **ERC-20** on X Layer. Always `approve` before `createClaim` / `challengeClaim`. Do not use `msg.value` for stakes.
- Gas is OKB (18 decimals). Stake amounts are USDC (6 decimals). Never mix the two units.
- Resolution is oracle-only — do not expose user-triggered `resolveClaim()` in UI.
- Chain id is `1952` (X Layer Testnet) — do not hardcode other chain ids.
- Sign legacy EIP-155 transactions; X Layer Testnet rejects EIP-1559.
- Categories: `sports`, `weather`, `crypto`, `culture`, `custom`.
