# AGENTS.md — Mimir

Mimir runs **three background agents** against X Layer Testnet (chain id `1952`). All three sign with viem using a local private key from env. All three pay native **OKB** for gas and stake **USDC** (`USDC_TEST`, 6 decimals, ERC-20 at `0xcB8BF24c6cE16Ad21D707c9505421a17f2bec79D`).

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

## Pundit (`agents/pundit/index.ts`)

Football-commentator persona. Reads open sport claims, runs an independent pre-event analysis (form, H2H, injuries) in a single batched LLM call, and stakes USDC on the side it disagrees with — writing a public "hot take" per pick into Postgres. Periodically opens its own opinionated markets too.

| Field          | Value                                                              |
| -------------- | ------------------------------------------------------------------ |
| Cadence        | Every 2h (`PUNDIT_INTERVAL_HOURS`)                                 |
| Signer         | `privateKeyToAccount(PUNDIT_PRIVATE_KEY)` via viem                 |
| Spends         | OKB for gas; USDC for `challengeClaim` and occasional `createClaim` |
| Reads          | Open sport claims on chain + market context from Postgres          |
| Writes         | `usdc.approve` + `challengeClaim`; every `PUNDIT_CREATE_EVERY_HOURS` also `createClaim` with own pick + "hot take" persisted off-chain |
| LLM            | Gemini 2.5 Flash (preferred) or Claude Sonnet 4.6                   |
| Distinguisher  | Different prompt and persona from the oracle's auto-challenger: the pundit acts on **sports knowledge**, not on evidence-reading |

Required env: `PUNDIT_PRIVATE_KEY`, `NEXT_PUBLIC_CONTRACT_ADDRESS`, `DATABASE_URL` (Neon Postgres — pundit writes hot takes there), one of `GEMINI_API_KEY` / `ANTHROPIC_API_KEY`. Optional: `PUNDIT_STAKE_USDC` (default 2), `PUNDIT_CONFIDENCE` (default 75), `PUNDIT_INTERVAL_HOURS` (default 2), `PUNDIT_MAX_PICKS_PER_RUN` (default 3), `PUNDIT_CREATE_EVERY_HOURS` (default 8).

## Key rules

- Contract state is the source of truth. Neon Postgres is a read-index cache only (plus the pundit's hot-take store).
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
npm run pundit              # hot takes every 2h
npm run workers             # all three, color-prefixed logs (Railway entry point)
```
