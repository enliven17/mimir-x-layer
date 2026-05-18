import { getDb, setSyncMeta } from "../lib/db";

async function main() {
  const pool = await getDb();
  await pool.query("TRUNCATE claims, challengers, challenge_opportunities");
  await setSyncMeta("last_claim_count", "0");
  await setSyncMeta("last_sync_at", "0");
  console.log("Wiped Neon tables and reset sync cursor.");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
