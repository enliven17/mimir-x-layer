# CLAUDE.md — Mimir codebase guide for AI assistants

> This file is auto-loaded by Claude Code, Cursor, and most agentic IDEs. Read it first.

## What this repo is

**Mimir** is an **AI-settled prediction market on X Layer Testnet** (OKX zkEVM L2, chain id `1952`) built for the X Cup Hackathon. Stakes are denominated in `USDC_TEST` (6-decimal ERC-20). Gas is paid in native OKB. Resolution is mechanical: an off-chain LLM agent fetches the agreed evidence URL, decides a verdict, and submits it on-chain with `keccak256(evidence)` committed for verifiability.

## If you only read 5 files, read these (in order)

1. **[contracts/Mimir.sol](contracts/Mimir.sol)** — the only smart contract. ~480 lines. Start here to understand the settlement primitive.
2. **[agents/oracle/index.ts](agents/oracle/index.ts)** — the settler agent. Polls every 60s, calls `resolveClaim()` after evidence + LLM verdict.
3. **[lib/contract.ts](lib/contract.ts)** — high-level TypeScript client that wraps `Mimir.sol` for both frontend and agents.
4. **[app/[locale]/vs/[id]/page.tsx](app/[locale]/vs/[id]/page.tsx)** — claim detail page, the canonical user-facing flow.
5. **[agents/market-creator/index.ts](agents/market-creator/index.ts)** + **[agents/pundit/index.ts](agents/pundit/index.ts)** — the two autonomous market participants.

## Architecture in one sentence

User wallet signs writes via wagmi → reads come from X Layer RPC + a Neon Postgres read-index → three Node workers on Railway (`oracle`, `market-creator`, `pundit`) each hold a private key and act as economic agents → `Mimir.sol` is the source of truth.

## Key invariants (do not violate)

- **`resolveClaim` is oracle-only.** The `oracle` address stored in the contract is the only authorized caller. Never expose it from the frontend.
- **USDC is ERC-20.** Every stake (`createClaim`, `challengeClaim`, `createRematch`) is a two-step tx: `usdc.approve(Mimir, amount)` then the action. The contract uses `transferFrom` and reverts on insufficient allowance.
- **Two currencies, two decimal counts.** Gas = OKB (18). Stake = USDC (6). Never mix the units. Use `usdcToMicro` / `microToUsdc` / `weiToOkb` from [lib/xlayer.ts](lib/xlayer.ts).
- **Anti-sniping window.** No challenges accepted in the final `CHALLENGE_LOCK_SECONDS` (60s) before deadline.
- **Evidence is on-chain.** `evidenceHash = keccak256(rawEvidence)` is committed on every resolve. Anyone can re-fetch the URL and verify.
- **X Layer rejects EIP-1559.** All txs are legacy EIP-155. See `signAndSendLegacy` in [lib/circle-w3s.ts](lib/circle-w3s.ts).

## Naming hazards

These are **misnamed back-compat shims**. Do not assume the filename matches the implementation:

| File | What the name suggests | What it actually is |
|---|---|---|
| [lib/circle-w3s.ts](lib/circle-w3s.ts) | Circle Web3 Services SDK | Vanilla viem signer with a local private key |
| [lib/arc.ts](lib/arc.ts) | Some "Arc" library | Re-export shim → [lib/xlayer.ts](lib/xlayer.ts) |

When adding new code, import from `lib/xlayer.ts` and `lib/circle-w3s.ts` (the latter despite its name). Do not introduce another signer path.

## Source of truth

When `contracts/Mimir.sol` changes, [lib/mimir-abi.ts](lib/mimir-abi.ts) and [lib/contract.ts](lib/contract.ts) MUST be updated in the same commit. They are hand-synced.

## Deployed addresses (X Layer Testnet)

- Mimir contract: `0x0924af6f439ff8da91d209733ed16b8ad7c8ce53`
- USDC_TEST stake token: `0xcB8BF24c6cE16Ad21D707c9505421a17f2bec79D`
- Explorer: <https://www.oklink.com/xlayer-test>

## Glossary

See [docs/GLOSSARY.md](docs/GLOSSARY.md) for Mimir-specific terms (claim, challenger, evidence hash, settlement rule, hot take, etc.).

## When you make changes

- Run `npm run test:smoke` for the Node-native test suite.
- Run `npm run build` to type-check + compile.
- Do **not** modify `contracts/Mimir.sol` — the deployed bytecode is verified on OKLink, and even comment changes alter the metadata hash and break verification. Treat the contract as frozen for the hackathon submission window.
- When changing agents, prefer the `executeContract({ ... })` helper from [lib/circle-w3s.ts](lib/circle-w3s.ts). Do not reach for `privateKeyToAccount` outside that helper.
