/**
 * Print every claim currently stored in the Mimir contract on X Layer Testnet.
 * Useful as a quick smoke check after running the market-creator agent.
 *
 * Run: npx tsx --env-file-if-exists=.env.local scripts/list-claims.ts
 */

import { createXLayerPublicClient, getContractAddress, microToUsdc } from "../lib/xlayer";
import { MIMIR_ABI } from "../lib/mimir-abi";

const STATE_LABEL: Record<number, string> = {
  0: "OPEN",
  1: "ACTIVE",
  2: "RESOLVED",
  3: "CANCELLED",
};

async function main() {
  const client = createXLayerPublicClient();
  const addr = getContractAddress();

  const total = (await client.readContract({
    address: addr,
    abi: MIMIR_ABI,
    functionName: "claimCount",
  })) as bigint;

  console.log(`\nMimir on X Layer Testnet — ${total} claim(s)`);
  console.log("─────────────────────────────────────────────────────────────");

  for (let i = 1n; i <= total; i++) {
    const c = (await client.readContract({
      address: addr,
      abi: MIMIR_ABI,
      functionName: "getClaim",
      args: [i],
    })) as readonly any[];

    const question = c[1] as string;
    const stake    = microToUsdc(c[5] as bigint);
    const deadline = new Date(Number(c[8] as bigint) * 1000).toISOString();
    const state    = Number(c[9] as number);
    const category = c[13] as string;

    console.log(
      `  #${i.toString().padStart(2)} [${STATE_LABEL[state] ?? state}] [${category}] ` +
      `(${stake.toFixed(2)} USDC, deadline ${deadline})`,
    );
    console.log(`     ${question}`);
  }
  console.log("─────────────────────────────────────────────────────────────\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
