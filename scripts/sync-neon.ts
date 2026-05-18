/**
 * Reconcile the Neon read-index with on-chain state.
 *
 * This is what /api/cron/sync runs every 5 min in production.
 *
 * Run: npx tsx --env-file-if-exists=.env.local scripts/sync-neon.ts
 */
import { reconcileVsIndex } from "../lib/server/vs-index";

async function main() {
  console.log("Reconciling Neon read-index with on-chain claims...");
  const summary = await reconcileVsIndex();
  console.log("Done.", summary);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
