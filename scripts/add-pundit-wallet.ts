/**
 * Additively generate the pundit wallet without touching existing wallets.
 *
 * Reads wallets.local.json, adds a `pundit` entry if missing, and writes it
 * back. Also prints the address so you can fund it from the X Layer faucet
 * and copy PUNDIT_PRIVATE_KEY / PUNDIT_ADDRESS into .env.local.
 *
 * Run: npx tsx scripts/add-pundit-wallet.ts
 */

import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { existsSync, readFileSync, writeFileSync } from "fs";
import * as path from "path";

const OUT_PATH = path.resolve(process.cwd(), "wallets.local.json");

type Wallet = { label: string; address: string; privateKey: string };
type WalletsFile = {
  deployer?:      Wallet;
  oracle?:        Wallet;
  marketCreator?: Wallet;
  pundit?:        Wallet;
};

function loadWallets(): WalletsFile {
  if (!existsSync(OUT_PATH)) return {};
  try {
    return JSON.parse(readFileSync(OUT_PATH, "utf-8")) as WalletsFile;
  } catch {
    return {};
  }
}

const wallets = loadWallets();

if (wallets.pundit?.privateKey) {
  console.log("");
  console.log("Pundit wallet already exists in wallets.local.json — not regenerating.");
  console.log("");
  console.log(`  Address    : ${wallets.pundit.address}`);
  console.log(`  Private key: ${wallets.pundit.privateKey}`);
  console.log("");
  process.exit(0);
}

const pk = generatePrivateKey();
const account = privateKeyToAccount(pk);
wallets.pundit = {
  label:      "pundit",
  address:    account.address,
  privateKey: pk,
};

writeFileSync(OUT_PATH, JSON.stringify(wallets, null, 2));

console.log("");
console.log("════════════════════════════════════════════════════════════");
console.log("  Mimir × X Layer — pundit wallet generated");
console.log("════════════════════════════════════════════════════════════");
console.log("");
console.log("  Network : X Layer Testnet (chainId 1952)");
console.log("  Faucet  : https://www.okx.com/xlayer/faucet");
console.log("");
console.log("──── Pundit Agent (sports commentator) ──────────────────────");
console.log(`  Address     : ${account.address}`);
console.log(`  Private key : ${pk}`);
console.log(`  Funds       : ~0.5 OKB (gas) + 10-20 USDC_TEST (stakes)`);
console.log("");
console.log("  Next steps:");
console.log(`    1. Fund the address above from the X Layer faucet`);
console.log(`    2. Add to .env.local:`);
console.log(`         PUNDIT_PRIVATE_KEY=${pk}`);
console.log(`         PUNDIT_ADDRESS=${account.address}`);
console.log(`    3. Run:  npm run pundit`);
console.log("");
console.log("════════════════════════════════════════════════════════════");
console.log("");
