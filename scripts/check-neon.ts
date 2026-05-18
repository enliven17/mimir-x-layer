/**
 * Quick smoke check on the Neon read-index.
 *
 * Run: npx tsx --env-file-if-exists=.env.local scripts/check-neon.ts
 */
import { getDb, getClaimsByFilter, getSyncMeta } from "../lib/db";

async function main() {
  // Touch the pool — this also triggers ensureSchema().
  const pool = await getDb();

  const tables = await pool.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public'
       ORDER BY table_name`,
  );

  console.log("\nNeon tables:");
  for (const row of tables.rows) console.log(`  - ${row.table_name}`);

  const claims = await getClaimsByFilter({ orderBy: "id_desc" });
  console.log(`\nIndexed claims: ${claims.length}`);
  for (const c of claims) {
    // readClaimRaw already converts micro-USDC to human USDC before writing
    // to Neon, so creator_stake is already in display units.
    const stake = c.creator_stake.toFixed(2);
    const deadline = new Date(c.deadline * 1000).toISOString().slice(0, 16);
    console.log(
      `  #${c.id} [${c.state}] [${c.category}] (${stake} USDC, ${deadline})`,
    );
    console.log(`     ${(c.question ?? "").slice(0, 100)}`);
  }

  const lastSync = await getSyncMeta("last_sync_at");
  const lastCount = await getSyncMeta("last_claim_count");
  console.log(`\nSync meta:`);
  console.log(`  last_sync_at    : ${lastSync}`);
  console.log(`  last_claim_count: ${lastCount}\n`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
