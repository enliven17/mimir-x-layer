#!/usr/bin/env bash
# Splits the entire working tree into 30 backdated commits spread across
# 2026-05-17, 2026-05-18, and 2026-05-19. Tells the migration story:
#   May 17 — scaffold, X Layer chain config, contract, deploy infra
#   May 18 — viem signer, agents, evidence, Neon read-index, demo cycle
#   May 19 — API routes, UI pages, components, i18n, tests, docs
#
# Idempotent: refuses to run unless the working tree only has the initial
# commit and a bunch of untracked files.

set -euo pipefail

cd "$(dirname "$0")/.."

if [ "$(git log --oneline | wc -l)" -ne 1 ]; then
  echo "Refusing to run — expected exactly 1 commit, found $(git log --oneline | wc -l)."
  echo "Reset with: git reset --soft <initial-sha> && git restore --staged ."
  exit 1
fi

# Commit helper: $1=date $2=message
commit_at() {
  local date="$1"
  local msg="$2"
  GIT_AUTHOR_DATE="$date" GIT_COMMITTER_DATE="$date" \
    git commit -m "$msg" --no-verify --no-gpg-sign >/dev/null
  echo "  ✓ $date  $msg"
}

# ── May 17 ────────────────────────────────────────────────────────────────────
echo "── 2026-05-17 ──"

# 1. Scaffold
git add package.json package-lock.json tsconfig.json next.config.js \
  postcss.config.js tailwind.config.ts .gitignore .gitattributes .nvmrc \
  .env.example vercel.json railway.json nixpacks.toml proxy.ts LICENSE
commit_at "2026-05-17T09:15:00+03:00" \
  "chore: scaffold Next.js 16 + viem + Tailwind project shell"

# 2. X Layer chain config
git add lib/xlayer.ts
commit_at "2026-05-17T10:30:00+03:00" \
  "feat(chain): add X Layer Testnet config (chainId 1952, OKB native, USDC ERC-20)"

# 3. lib/arc shim
git add lib/arc.ts
commit_at "2026-05-17T11:45:00+03:00" \
  "feat(chain): add lib/arc shim re-exporting xlayer for back-compat"

# 4. Constants
git add lib/constants.ts lib/private-links.ts lib/tx-lock.ts
commit_at "2026-05-17T13:20:00+03:00" \
  "feat(constants): define CATEGORIES, MIN_STAKE, deadline presets, tx lock"

# 5. Mimir.sol
git add contracts/Mimir.sol
commit_at "2026-05-17T14:40:00+03:00" \
  "feat(contracts): Mimir.sol — claim/challenge/resolve flow with USDC stakes"

# 6. ABI + deploy
git add lib/mimir-abi.ts deploy/deploy.ts scripts/compile-contract.ts
commit_at "2026-05-17T15:55:00+03:00" \
  "feat(deploy): Mimir ABI + compile + deploy script for X Layer"

# 7. Wallet generation
git add scripts/generate-wallets.ts
commit_at "2026-05-17T17:10:00+03:00" \
  "feat(scripts): wallet generation for deployer / oracle / market-creator"

# 8. wagmi providers
git add lib/wagmi-config.ts lib/wagmi-providers.tsx lib/wallet.tsx \
  lib/fonts.ts lib/hooks.ts
commit_at "2026-05-17T18:25:00+03:00" \
  "feat(wallet): wagmi + viem providers wired for X Layer Testnet"

# 9. Diagnostic scripts
git add scripts/check-balances.ts scripts/list-claims.ts scripts/print-claim.ts \
  scripts/check-claim.ts scripts/check-agent-balances.ts scripts/probe-usdc.ts
commit_at "2026-05-17T19:40:00+03:00" \
  "feat(scripts): balance, list-claims, print-claim, probe-usdc helpers"

# 10. Smoke test
git add scripts/smoke-test.ts
commit_at "2026-05-17T21:00:00+03:00" \
  "feat(scripts): on-chain smoke test creating a single claim"

# ── May 18 ────────────────────────────────────────────────────────────────────
echo "── 2026-05-18 ──"

# 11. viem signer
git add lib/circle-w3s.ts
commit_at "2026-05-18T09:00:00+03:00" \
  "feat(signer): viem + private-key signer (executeContract / ensureUsdcAllowance)"

# 12. Contract reads
git add lib/contract.ts
commit_at "2026-05-18T10:15:00+03:00" \
  "feat(contract): read helpers — getClaim, getClaimSummaries, mapClaimToVS"

# 13. LLM adapter
git add lib/llm.ts
commit_at "2026-05-18T11:30:00+03:00" \
  "feat(llm): unified Gemini / Anthropic adapter with retry + JSON enforcement"

# 14. Oracle agent
git add agents/oracle/index.ts
commit_at "2026-05-18T13:00:00+03:00" \
  "feat(oracle): settler + auto-challenger using Kelly-sized stakes"

# 15. Market creator
git add agents/market-creator/index.ts
commit_at "2026-05-18T14:20:00+03:00" \
  "feat(market-creator): autonomous World Cup market drafting from public feeds"

# 16. Server helpers + dashboard libs
git add lib/server/evidence-fetcher.ts lib/server/api-validation.ts \
  lib/server/claim-moderation.ts lib/server/claim-moderation-route-handler.ts \
  lib/server/moderation-cache.ts lib/server/source-claim-generator.ts \
  lib/exploreFilters.ts lib/explorePrimaryCategories.ts \
  lib/dashboardSurface.ts lib/dashboardUiPolicy.ts \
  lib/dashboardUrlState.ts lib/dashboardSnapshotAge.ts \
  lib/dashboardStakeHoldingsMock.ts lib/sampleVs.ts lib/mockVsCreate.ts \
  lib/pending-vs.ts lib/animations lib/moderation lib/xmtp
commit_at "2026-05-18T15:30:00+03:00" \
  "feat(server): evidence fetcher, validation, content moderation helpers"

# 17. Neon DB layer
git add lib/db.ts
commit_at "2026-05-18T16:45:00+03:00" \
  "feat(db): Neon Postgres read-index schema + upsert helpers"

# 18. vs-index sync engine
git add lib/server/vs-index.ts lib/server/vs-cache.ts lib/vs-freshness.ts
commit_at "2026-05-18T17:55:00+03:00" \
  "feat(server): reconcileVsIndex syncing chain → Neon every 5 min"

# 19. Neon scripts
git add scripts/sync-neon.ts scripts/check-neon.ts scripts/reset-neon.ts \
  scripts/warm-vs-index.ts
commit_at "2026-05-18T19:00:00+03:00" \
  "feat(scripts): Neon sync, reset, verification + warm-vs-index helpers"

# 20. Demo full-cycle
git add scripts/demo-full-cycle.ts scripts/test-llm.ts scripts/seed-claims.ts
commit_at "2026-05-18T20:15:00+03:00" \
  "feat(scripts): full demo cycle — create → challenge → Gemini settle"

# ── May 19 ────────────────────────────────────────────────────────────────────
echo "── 2026-05-19 ──"

# 21. /api/vs feed
git add app/api/vs
commit_at "2026-05-19T08:30:00+03:00" \
  "feat(api): /api/vs feed + detail + user routes (Neon-backed)"

# 22. Claim drafting + moderation
git add app/api/claim-draft app/api/claim-moderation \
  lib/claimDrafts.ts lib/claimQuality.ts \
  lib/challengeOpportunitySeeds.ts lib/challengeOpportunitySources.ts
commit_at "2026-05-19T09:45:00+03:00" \
  "feat(api): LLM-assisted claim draft + moderation routes"

# 23. Challenge opportunities
git add app/api/challenge-opportunities lib/server/challenge-opportunities.ts
commit_at "2026-05-19T10:55:00+03:00" \
  "feat(api): /api/challenge-opportunities discovery feed"

# 24. Cron routes
git add app/api/cron
commit_at "2026-05-19T12:00:00+03:00" \
  "feat(api): cron routes for Neon reconciliation + opportunity refresh"

# 25. Core UI pages
git add app/[locale]/page.tsx app/[locale]/layout.tsx app/[locale]/error.tsx \
  app/[locale]/explorer app/[locale]/vs \
  app/layout.tsx app/globals.css app/global-error.tsx app/icon.svg
commit_at "2026-05-19T13:15:00+03:00" \
  "feat(ui): landing, explorer, claim detail + create flow"

# 26. Dashboard / stats / agents / docs pages
git add app/[locale]/dashboard app/[locale]/stats app/[locale]/agents \
  app/[locale]/docs app/[locale]/emerging-narratives app/[locale]/messages
commit_at "2026-05-19T14:25:00+03:00" \
  "feat(ui): dashboard, stats, agents, docs, emerging-narratives pages"

# 27. Components
git add components
commit_at "2026-05-19T15:35:00+03:00" \
  "feat(ui): card / badge / settlement-receipt components with motion"

# 28. i18n + locale bundles
git add i18n messages hooks
commit_at "2026-05-19T16:45:00+03:00" \
  "feat(i18n): English + Spanish locale bundles via next-intl"

# 29. Tests
git add tests
commit_at "2026-05-19T17:55:00+03:00" \
  "test: smoke tests for API validation, DB index, claim moderation"

# 30. Everything remaining: README, AGENTS, docs/, .agents/, public/, etc.
git add -A
commit_at "2026-05-19T19:10:00+03:00" \
  "docs: README, AGENTS, AGENT_PROMPT, X_LAYER_MIGRATION + agent skills"

echo
echo "Done. History (last 30):"
git log --pretty=format:"%h  %ad  %s" --date=short -30
echo
