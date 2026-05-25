/**
 * Print everything OKLink's "Verify & Publish" form needs for the deployed
 * Mimir contract. Reads the on-chain constructor args (oracle, stakeToken) so
 * the encoded blob matches what was actually deployed.
 *
 * Run: npx tsx --env-file-if-exists=.env.local scripts/oklink-verify-info.ts
 *
 * Then go to:
 *   https://www.oklink.com/xlayer-test/address/<contract>/contract
 * and paste the values below into the verification form.
 */

import { readFileSync } from "node:fs";
import * as path from "node:path";
import { encodeAbiParameters, parseAbiParameters } from "viem";
import {
  createArcPublicClient,
  getContractAddress,
  getExplorerAddressUrl,
} from "../lib/arc";
import { MIMIR_ABI } from "../lib/mimir-abi";

async function main() {
  const client = createArcPublicClient();
  const contract = getContractAddress();

  if (
    !contract ||
    contract.toLowerCase() === "0x0000000000000000000000000000000000000000"
  ) {
    throw new Error(
      "NEXT_PUBLIC_CONTRACT_ADDRESS is not set. Add it to .env.local first.",
    );
  }

  // Read constructor args from chain — guarantees the encoded blob matches
  // what was actually deployed even if .env values drift.
  const [oracle, stakeToken] = (await Promise.all([
    client.readContract({
      address: contract,
      abi: MIMIR_ABI,
      functionName: "oracle",
    }),
    client.readContract({
      address: contract,
      abi: MIMIR_ABI,
      functionName: "stakeToken",
    }),
  ])) as [`0x${string}`, `0x${string}`];

  const encoded = encodeAbiParameters(
    parseAbiParameters("address stakeToken, address oracle"),
    [stakeToken, oracle],
  );
  const encodedNoPrefix = encoded.slice(2);

  const sourcePath = path.resolve(process.cwd(), "contracts/Mimir.sol");
  const source = readFileSync(sourcePath, "utf-8");

  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  Mimir — OKLink Verification Info");
  console.log("═══════════════════════════════════════════════════════════════\n");
  console.log(`Contract address  : ${contract}`);
  console.log(`OKLink page       : ${getExplorerAddressUrl(contract)}`);
  console.log(`Verify page       : ${getExplorerAddressUrl(contract)}/contract\n`);
  console.log("─── Compiler settings ─────────────────────────────────────────");
  console.log("  Compiler type     : Solidity (Single file)");
  console.log("  Compiler version  : v0.8.28+commit.7893614a");
  console.log("  Open-source license: MIT");
  console.log("  Optimization      : Yes");
  console.log("  Optimizer runs    : 200");
  console.log("  EVM version       : default (paris)");
  console.log("  viaIR             : Yes  ← important, defaults to No");
  console.log("");
  console.log("─── Constructor args (read live from chain) ───────────────────");
  console.log(`  stakeToken : ${stakeToken}`);
  console.log(`  oracle     : ${oracle}`);
  console.log("");
  console.log("  ABI-encoded (paste into 'Constructor Arguments ABI-encoded'):");
  console.log(`  ${encodedNoPrefix}`);
  console.log("");
  console.log("─── Source code ───────────────────────────────────────────────");
  console.log(`  File: contracts/Mimir.sol (${source.length} bytes)`);
  console.log("  Paste the full contents of that file into the source box.");
  console.log("");
  console.log("─── Steps ──────────────────────────────────────────────────────");
  console.log("  1. Open the Verify page (URL above).");
  console.log("  2. Pick 'Solidity (Single file)'.");
  console.log("  3. Paste the source, set compiler version + optimizer + viaIR.");
  console.log("  4. Paste the ABI-encoded constructor args (no 0x prefix).");
  console.log("  5. Submit. OKLink will compile + match bytecode.");
  console.log("");
  console.log("  If OKLink rejects with a bytecode mismatch, re-run");
  console.log("  `npm run contract:compile` and confirm the produced bytecode");
  console.log("  matches the chain via `getCode(contract)`.");
}

main().catch((e) => {
  console.error("\noklink-verify-info failed:", e?.message ?? e);
  process.exit(1);
});
