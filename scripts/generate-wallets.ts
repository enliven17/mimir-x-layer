/**
 * Generate fresh wallets for X Layer Testnet deployment.
 *
 * Creates 4 EOAs:
 *   1. Deployer       — pays gas to deploy Mimir.sol
 *   2. Oracle Agent   — settles claims, optionally auto-challenges
 *   3. Market Creator — opens markets from public data feeds
 *   4. Pundit Agent   — sports-commentator LLM that opens claims AND stakes
 *
 * Run:   npx tsx scripts/generate-wallets.ts
 * Output is written to wallets.local.json (git-ignored) so it's never committed.
 */

import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { writeFileSync, existsSync } from "fs";
import * as path from "path";

const OUT_PATH = path.resolve(process.cwd(), "wallets.local.json");

if (existsSync(OUT_PATH) && process.env.FORCE !== "1") {
  console.error(
    `\nwallets.local.json already exists. Re-run with FORCE=1 to overwrite.\n`,
  );
  process.exit(1);
}

function makeWallet(label: string) {
  const pk = generatePrivateKey();
  const account = privateKeyToAccount(pk);
  return { label, address: account.address, privateKey: pk };
}

const wallets = {
  deployer: makeWallet("deployer"),
  oracle: makeWallet("oracle"),
  marketCreator: makeWallet("market-creator"),
  pundit: makeWallet("pundit"),
};

writeFileSync(OUT_PATH, JSON.stringify(wallets, null, 2));

console.log("");
console.log("════════════════════════════════════════════════════════════");
console.log("  Mimir × X Layer — fresh wallets generated");
console.log("════════════════════════════════════════════════════════════");
console.log("");
console.log("  Network : X Layer Testnet (chainId 195)");
console.log("  Faucet  : https://www.okx.com/xlayer/faucet");
console.log("  Bridge  : https://www.okx.com/web3/dex-swap");
console.log("");
console.log("──── Deployer ──────────────────────────────────────────────");
console.log(`  Address : ${wallets.deployer.address}`);
console.log(`  Funds   : ~0.1 OKB (one-time, for contract deploy)`);
console.log("");
console.log("──── Oracle Agent ──────────────────────────────────────────");
console.log(`  Address : ${wallets.oracle.address}`);
console.log(`  Funds   : ~0.5 OKB (gas for settlement txs + auto-challenge)`);
console.log("");
console.log("──── Market Creator Agent ──────────────────────────────────");
console.log(`  Address : ${wallets.marketCreator.address}`);
console.log(`  Funds   : ~1 OKB (gas + stake on each market it opens)`);
console.log("");
console.log("──── Pundit Agent (sports commentator) ────────────────────");
console.log(`  Address : ${wallets.pundit.address}`);
console.log(`  Funds   : ~1 OKB (gas + stake on bets it places)`);
console.log("");
console.log("════════════════════════════════════════════════════════════");
console.log("");
console.log(`  Keys saved to: ${OUT_PATH}`);
console.log("  This file is git-ignored. Never share its contents.");
console.log("");
console.log("  Next step:");
console.log("    1. Fund all 4 addresses from the X Layer faucet above");
console.log("    2. Verify balances on the explorer:");
console.log("       https://www.oklink.com/xlayer-test/address/<addr>");
console.log("    3. Tell me when funded — I'll deploy the contract");
console.log("");
