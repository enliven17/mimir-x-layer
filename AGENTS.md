# AGENTS.md — Mimir

Mimir runs two background agents against X Layer Testnet (chain id `1952`). Both sign with viem using a local private key from env. Both pay native **OKB** for gas and stake **USDC** (`USDC_TEST`, 6 decimals, ERC-20 at `0xcB8BF24c6cE16Ad21D707c9505421a17f2bec79D`).

## Oracle (`agents/oracle/index.ts`)

The settler. Optionally also a participant.

| Field          | Value                                                              |
| -------------- | ------------------------------------------------------------------ |
| Cadence        | Poll every 60s                                                     |
| Signer         | `privateKeyToAccount(ORACLE_PRIVATE_KEY)` via viem                 |
| Spends         | OKB for gas; USDC for auto-challenge stakes (when `AUTO_CHALLENGE=1`) |
| Reads          | Active claims past their deadline                                  |
| Writes         | `resolveClaim(claimId, side, summary, confidence, evidenceHash)`. With `AUTO_CHALLENGE=1`, also `usdc.approve` + `challengeClaim` on mispriced open claims. |
| LLM            | Gemini 2.5 Flash (preferred) or Claude Sonnet 4.6                   |

Required env: `ORACLE_PRIVATE_KEY`, `NEXT_PUBLIC_CONTRACT_ADDRESS`, one of `GEMINI_API_KEY` / `ANTHROPIC_API_KEY`. Optional: `AUTO_CHALLENGE=1`, `CHALLENGE_STAKE_OKB`, `CHALLENGE_CONFIDENCE`.

## Market-creator (`agents/market-creator/index.ts`)

Drafts and opens FIFA World Cup 2026 prediction markets autonomously.

| Field          | Value                                                              |
| -------------- | ------------------------------------------------------------------ |
| Cadence        | Every 6h (`RUN_INTERVAL_HOURS`)                                    |
| Signer         | `privateKeyToAccount(CREATOR_PRIVATE_KEY)` via viem                |
| Spends         | OKB for gas; USDC for the creator-side stake on every new claim     |
| Reads          | World Cup fixtures, public news/data feeds                         |
| Writes         | `usdc.approve(Mimir, stake)` then `createClaim(...)` per draft     |
| LLM            | Gemini 2.5 Flash (preferred) or Claude Sonnet 4.6                   |

Required env: `CREATOR_PRIVATE_KEY`, `NEXT_PUBLIC_CONTRACT_ADDRESS`, one of `GEMINI_API_KEY` / `ANTHROPIC_API_KEY`. Optional: `CREATOR_STAKE_OKB`, `MAX_CLAIMS_PER_RUN` (default 5), `RUN_INTERVAL_HOURS` (default 6).

## Key rules

- Contract state is the source of truth. Neon Postgres is a read-index cache only.
- Stakes are ERC-20 USDC. Every `createClaim` / `challengeClaim` is a two-step tx: `approve` then the action. The contract uses `transferFrom` and reverts if the allowance is insufficient.
- Resolution is oracle-only. `resolveClaim()` only accepts calls from the `oracle` address set in the contract.
- Adding a new agent flow? Reuse `executeContract({ ... })` in `lib/circle-w3s.ts` (the name is legacy; it's a viem signer now). Don't reach for `privateKeyToAccount` outside the central helper.
- When `Mimir.sol` changes, keep `lib/mimir-abi.ts` and `lib/contract.ts` in sync.
- Categories: `sports`, `weather`, `crypto`, `culture`, `custom`.

## Run

```bash
npm run oracle              # settler only
npm run oracle:challenge    # AUTO_CHALLENGE=1
npm run market-creator      # drafts every 6h
npm run workers             # both, color-prefixed logs (Railway entry point)
```
