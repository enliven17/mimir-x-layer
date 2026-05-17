/**
 * Print full state of a single claim. Useful to inspect a resolved demo run.
 *
 * Usage: npx tsx --env-file-if-exists=.env.local scripts/print-claim.ts <id>
 */
import { createXLayerPublicClient, getContractAddress, microToUsdc, getExplorerTxUrl } from "../lib/xlayer";
import { MIMIR_ABI } from "../lib/mimir-abi";

const STATE_LABEL = ["OPEN", "ACTIVE", "RESOLVED", "CANCELLED"];
const SIDE_LABEL  = ["NONE", "CREATOR", "CHALLENGERS", "DRAW", "UNRESOLVABLE"];

async function main() {
  const id = Number(process.argv[2]);
  if (!id) throw new Error("Usage: print-claim.ts <id>");

  const client = createXLayerPublicClient();
  const addr = getContractAddress();
  const claim = (await client.readContract({
    address: addr,
    abi: MIMIR_ABI,
    functionName: "getClaim",
    args: [BigInt(id)],
  })) as readonly any[];

  console.log(`\nClaim #${id}`);
  console.log("──────────────────────────────────────────────────────────────");
  console.log(`  question        : ${claim[1]}`);
  console.log(`  creator         : ${claim[0]}`);
  console.log(`  side A          : ${claim[2]}`);
  console.log(`  side B          : ${claim[3]}`);
  console.log(`  resolution url  : ${claim[4]}`);
  console.log(`  creator stake   : ${microToUsdc(claim[5]).toFixed(2)} USDC`);
  console.log(`  challenger stake: ${microToUsdc(claim[6]).toFixed(2)} USDC`);
  console.log(`  deadline        : ${new Date(Number(claim[8]) * 1000).toISOString()}`);
  console.log(`  state           : ${STATE_LABEL[Number(claim[9])]}`);
  console.log(`  winner          : ${SIDE_LABEL[Number(claim[10])]}`);
  console.log(`  confidence      : ${Number(claim[12])}%`);
  console.log(`  category        : ${claim[13]}`);
  console.log(`  challengers     : ${Number(claim[15])}`);
  console.log(`  resolution      : ${claim[11]}`);
  console.log(`  evidenceHash    : ${claim[17]}`);
  console.log(`  explorer        : ${getExplorerTxUrl(addr).replace("/tx/", "/address/")}`);
  console.log("──────────────────────────────────────────────────────────────\n");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
