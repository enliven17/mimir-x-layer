# Mimir

**AI-settled prediction market on X Layer Testnet with USDC stakes.**

Mimir is a peer-to-peer market for verifiable claims about future outcomes. Two parties stake USDC on opposite sides of a question; when the deadline passes, an off-chain AI oracle reads the agreed evidence source, decides a verdict, and settles the payout on-chain. No judges, no committees, no manual disputes.

## What it does

A **claim** is a single, verifiable question with a deadline and a designated resolution source. For example:

> *"Will Spain top Group D after their first match according to fifa.com by 2026-06-15?"*

Anyone can create a claim, stake USDC on one side, and publish it. Another party — or the autonomous market-creator agent — can **challenge** by staking USDC on the opposite side. When the deadline passes, the **oracle agent** fetches the resolution URL, asks an LLM to evaluate the outcome against the stated rule, and submits the verdict on-chain. The smart contract then atomically pays out the winning side.

## Architecture

Three independent runtime tiers:

| Tier            | Runs on   | Responsibility                                                              |
| --------------- | --------- | --------------------------------------------------------------------------- |
| Frontend        | Vercel    | Next.js 16 App Router + API routes. User-signed writes via wagmi/viem.      |
| Workers         | Railway   | Long-lived Node processes: `oracle` (settler + auto-challenger) and `market-creator`. |
| Read-index      | Neon      | Denormalised Postgres cache of on-chain state. Optional.                    |
| Settlement      | X Layer   | `Mimir.sol` on chain id 1952. Stakes denominated in USDC (ERC-20).          |

Reads go to X Layer RPC directly. Writes from end users are user-signed via wagmi; writes from the agents are signed locally with viem using private keys in env vars.

## The settlement lifecycle

1. **Creator** calls `usdc.approve(Mimir, stake)` then `createClaim(question, resolutionUrl, deadline, stake, ...)`. Mimir pulls the stake via `transferFrom`. Claim state becomes `OPEN`.
2. **Challenger** calls `usdc.approve(Mimir, stake)` then `challengeClaim(claimId, stake, ...)`. State becomes `ACTIVE`. New challenges are rejected during the last 60s before the deadline.
3. **Deadline** passes. The oracle agent's poll loop picks up the claim.
4. **Oracle** fetches the `resolutionUrl`, hashes the raw bytes (`keccak256`), and asks an LLM to evaluate `{question, evidence, settlementRule}`. The LLM returns `{verdict, confidence, summary}`.
5. **Oracle** calls `resolveClaim(claimId, side, summary, confidence, evidenceHash)`. Only the address stored as `oracle` in the contract can call this.
6. **Contract** transitions to `RESOLVED` and pays out USDC to the winning side. `DRAW` and `UNRESOLVABLE` refund all stakes.

`evidenceHash` is on-chain — anyone can re-fetch the URL, hash it, and verify what the oracle actually saw. `confidence < 60` is force-downgraded to `UNRESOLVABLE` and refunded.

## Stake mechanics

Stakes are denominated in **USDC** — specifically `USDC_TEST` on X Layer Testnet at `0xcB8BF24c6cE16Ad21D707c9505421a17f2bec79D`, **6 decimals**. Gas is paid in native **OKB** (18 decimals) by the caller's wallet.

Because USDC is an ERC-20 token, every stake is a two-step transaction:

```text
1. usdc.approve(NEXT_PUBLIC_CONTRACT_ADDRESS, stakeAmount)
2. mimir.createClaim(...)   // or challengeClaim(...)
```

The contract enforces this internally — `createClaim` and `challengeClaim` both call `usdc.transferFrom(msg.sender, address(this), stakeAmount)` and revert if the allowance is insufficient. The minimum stake is `1 USDC` (`1_000_000` in 6-decimal units).

## Agents

Two background workers run continuously. Both sign transactions locally using viem with a private key resolved from env (`ORACLE_PRIVATE_KEY`, `CREATOR_PRIVATE_KEY`) or from `wallets.local.json` in dev. Both pay OKB for gas and USDC for stakes.

| Agent          | Cadence | Reads                    | Writes                              | LLM                    |
| -------------- | ------- | ------------------------ | ----------------------------------- | ---------------------- |
| oracle         | 60s     | Active claims past deadline | `resolveClaim`, optional `challengeClaim` (auto-challenge) | Gemini or Claude       |
| market-creator | 6h      | World Cup 2026 fixtures, news feeds | `createClaim` with creator-side USDC stake | Gemini or Claude       |

The **oracle** is the settler — it reads evidence, asks the LLM for a verdict, and submits `resolveClaim`. With `AUTO_CHALLENGE=1` it also acts as a participant, Kelly-sizing counter-stakes on claims it believes are mispriced.

The **market-creator** drafts FIFA World Cup 2026 prediction markets from public fixture and news data, scores each candidate, and opens the highest-scoring ones on-chain. Opening a claim costs USDC (the creator-side stake) plus OKB gas — curation is an economic commitment, not a free post.

## Tech stack

| Layer            | Choice                                                       |
| ---------------- | ------------------------------------------------------------ |
| Frontend         | Next.js 16 (App Router) + React 18 + TypeScript + Tailwind   |
| Wallet           | wagmi v3 + viem v2                                           |
| Smart contract   | Solidity 0.8.20, compiled with solc 0.8.28 `viaIR`           |
| Chain            | X Layer Testnet (OKX zkEVM L2), chain id `1952`              |
| Stake token      | `USDC_TEST` ERC-20, 6 decimals                               |
| Gas              | Native OKB, 18 decimals                                      |
| Agent signer     | viem `privateKeyToAccount` + local key from env              |
| LLM              | Google Gemini 2.5 Flash *or* Anthropic Claude Sonnet 4.6     |
| Messaging        | XMTP Browser SDK v7 (optional E2E chat between parties)      |
| Read-index       | Neon Postgres via `@neondatabase/serverless`                 |
| Frontend host    | Vercel                                                        |
| Worker host      | Railway                                                       |

## Repository layout

```
mimir-x-layer/
├── app/                  Next.js App Router pages + API routes
├── agents/
│   ├── oracle/           Settler + auto-challenger
│   └── market-creator/   Autonomous World Cup 2026 market author
├── contracts/
│   └── Mimir.sol         The only contract. ERC-20 stake (USDC) on X Layer
├── lib/
│   ├── xlayer.ts         Chain config + viem clients (chainId 1952)
│   ├── arc.ts            Back-compat shim — re-exports from xlayer.ts
│   ├── mimir-abi.ts      Generated ABI + state constants
│   ├── contract.ts       High-level TypeScript contract client
│   ├── circle-w3s.ts     Legacy-named viem signer shim used by the agents
│   └── llm.ts            Provider-agnostic LLM call (Gemini / Anthropic)
├── scripts/
│   ├── generate-wallets.ts    Writes wallets.local.json (deployer/oracle/creator)
│   ├── compile-contract.ts    solc 0.8.28 viaIR → artifacts/Mimir.bin
│   ├── check-balances.ts      Print OKB + USDC balances of the three wallets
│   └── seed-claims.ts         Bulk-seed demo markets
├── deploy/
│   └── deploy.ts         Legacy-EIP-155 deploy script (no EIP-1559 on X Layer)
└── package.json
```

## Local setup

Prerequisites: Node.js 20+, an LLM key (Gemini preferred), and a faucet drop on three X Layer wallets.

```bash
npm install
npm run wallets:generate              # writes wallets.local.json
# fund the 3 wallets from https://www.okx.com/xlayer/faucet (OKB + USDC)
npm run contract:compile
DEPLOYER_PRIVATE_KEY=... ORACLE_ADDRESS=... npm run deploy:contract
# write NEXT_PUBLIC_CONTRACT_ADDRESS + ORACLE_PRIVATE_KEY + CREATOR_PRIVATE_KEY + GEMINI_API_KEY to .env.local
npm run dev
npm run workers   # runs oracle + market-creator concurrently
```

`npm run wallets:generate` writes a git-ignored `wallets.local.json` with three keypairs. The faucet at `okx.com/xlayer/faucet` drops OKB (for gas) and USDC_TEST (for stakes) on testnet addresses. After deploy, paste the contract address into `.env.local` as `NEXT_PUBLIC_CONTRACT_ADDRESS`.

## Configuration reference

All env vars live in `.env.example`. Key ones:

| Variable                            | Required by              | Notes                                                              |
| ----------------------------------- | ------------------------ | ------------------------------------------------------------------ |
| `NEXT_PUBLIC_CONTRACT_ADDRESS`      | frontend + agents        | Address of the deployed `Mimir.sol`                                |
| `NEXT_PUBLIC_DEPLOY_BLOCK`          | stats, agents page       | Block number where the contract was deployed (for log scans)      |
| `NEXT_PUBLIC_XLAYER_RPC` / `XLAYER_RPC` | frontend / server reads | Override RPC; defaults to `https://testrpc.xlayer.tech`            |
| `DEPLOYER_PRIVATE_KEY`              | deploy script            | One-time use during `npm run deploy:contract`                      |
| `ORACLE_PRIVATE_KEY` / `ORACLE_ADDRESS` | oracle agent          | Signs `resolveClaim` + optional auto-challenges                    |
| `CREATOR_PRIVATE_KEY` / `CREATOR_ADDRESS` | market-creator      | Signs `createClaim`                                                |
| `GEMINI_API_KEY`                    | LLM (preferred)          | Gemini wins when both LLM keys are present                          |
| `ANTHROPIC_API_KEY`                 | LLM (fallback)           |                                                                     |
| `LLM_PROVIDER`                      | optional                 | Force `gemini` or `anthropic` when both keys set                   |
| `AUTO_CHALLENGE`                    | oracle worker            | `1` to enable Kelly auto-staking                                   |
| `CHALLENGE_STAKE_OKB`               | oracle worker            | Min stake per auto-challenge (default 0.05) — name is legacy, value applies to USDC units in the wrapper |
| `CHALLENGE_CONFIDENCE`              | oracle worker            | Min LLM confidence % to auto-stake (default 80)                    |
| `CREATOR_STAKE_OKB`                 | market-creator           | Stake per new claim (default 0.05) — legacy-named knob              |
| `MAX_CLAIMS_PER_RUN`                | market-creator           | Default 5                                                          |
| `DATABASE_URL`                      | optional                 | Neon Postgres read-index                                            |
| `NEXT_PUBLIC_FEATURE_XMTP`          | optional                 | Toggle the XMTP inbox feature                                       |

## Scripts

| Command                          | What it does                                                |
| -------------------------------- | ----------------------------------------------------------- |
| `npm run dev`                    | Next.js dev server on `:3000`                               |
| `npm run build` / `npm start`    | Production build / serve                                    |
| `npm run wallets:generate`       | Generate deployer/oracle/creator keys to `wallets.local.json` |
| `npm run contract:compile`       | Compile `Mimir.sol` with solc 0.8.28 `viaIR`                |
| `npm run deploy:contract`        | Deploy `Mimir.sol` to X Layer Testnet (legacy EIP-155 tx)   |
| `npm run oracle`                 | Run only the oracle (settler)                               |
| `npm run oracle:challenge`       | Oracle with `AUTO_CHALLENGE=1`                              |
| `npm run market-creator`         | Run only the market-creator                                 |
| `npm run workers`                | Run both agents in parallel (Railway entry point)           |
| `npm run seed` / `npm run seed:dry` | Seed demo claims (live / dry-run)                        |
| `npm run warm:vs-index`          | Rebuild Neon read-index from on-chain state                 |
| `npm run test:smoke`             | Node-native smoke tests                                      |

## Design principles

- **AI-settled.** Resolution is mechanical: fetch evidence, ask an LLM, write the verdict on-chain. No human disputes.
- **Evidence is on-chain.** `keccak256(rawEvidence)` is committed on every `resolveClaim`. Anyone can re-hash the source and verify what the oracle saw.
- **Refund the ambiguous.** `DRAW` and `UNRESOLVABLE` return stakes. Better inconclusive than fabricated.
- **Agents are economic participants.** The market-creator stakes its own USDC to open each market; the oracle (with `AUTO_CHALLENGE=1`) Kelly-sizes its own counter-stakes. Both pay OKB gas and risk USDC.
- **USDC-denominated for stable accounting.** Stake sizes, payouts, and analytics are all in USDC — independent of OKB's price movement.

## Deployed addresses

X Layer Testnet (chain id `1952`):

```text
NEXT_PUBLIC_CONTRACT_ADDRESS=0x0924af6f439ff8da91d209733ed16b8ad7c8ce53
USDC stake token (USDC_TEST, 6 decimals)=0xcB8BF24c6cE16Ad21D707c9505421a17f2bec79D
Native gas=OKB (18 decimals)

Explorer: https://www.oklink.com/xlayer-test
Faucet:   https://www.okx.com/xlayer/faucet
RPC:      https://xlayertestrpc.okx.com  (also https://testrpc.xlayer.tech)
```

## License

AGPL-3.0 — see [`LICENSE`](./LICENSE).
