/**
 * Print OKB (gas) + USDC (stake) balances for the deployer / oracle /
 * market-creator wallets. Useful to verify funding before running the
 * full-cycle demo or starting the agents.
 *
 * Run: npx tsx --env-file-if-exists=.env.local scripts/check-balances.ts
 */

import { readFileSync, existsSync } from "fs";
import * as path from "path";
import { createXLayerPublicClient, weiToOkb, getUsdcAddress } from "../lib/xlayer";
import { ERC20_MIN_ABI } from "../lib/xlayer";

const file = path.resolve(process.cwd(), "wallets.local.json");
if (!existsSync(file)) {
  console.error("wallets.local.json not found. Run: npm run wallets:generate");
  process.exit(1);
}

const wallets = JSON.parse(readFileSync(file, "utf-8")) as {
  deployer: { address: `0x${string}` };
  oracle: { address: `0x${string}` };
  marketCreator: { address: `0x${string}` };
};

const client = createXLayerPublicClient();

const rows = [
  { label: "deployer       ", addr: wallets.deployer.address },
  { label: "oracle         ", addr: wallets.oracle.address },
  { label: "market-creator ", addr: wallets.marketCreator.address },
];

const USDC_ADDR = getUsdcAddress();

async function readUsdc(addr: `0x${string}`): Promise<bigint> {
  return (await client.readContract({
    address: USDC_ADDR,
    abi: ERC20_MIN_ABI,
    functionName: "balanceOf",
    args: [addr],
  })) as bigint;
}

async function main() {
  console.log("\nX Layer Testnet balances:");
  console.log("─────────────────────────────────────────────────────────────────────────────");
  for (const { label, addr } of rows) {
    const [wei, usdc] = await Promise.all([
      client.getBalance({ address: addr }),
      readUsdc(addr),
    ]);
    console.log(
      `  ${label} ${addr}   ` +
        `${weiToOkb(wei).toFixed(4).padStart(8)} OKB   ` +
        `${(Number(usdc) / 1e6).toFixed(2).padStart(8)} USDC`,
    );
  }
  console.log("─────────────────────────────────────────────────────────────────────────────");
  console.log("Faucet OKB : https://www.okx.com/xlayer/faucet");
  console.log("USDC test  : ask the deployer wallet (which minted the test USDC) to transfer.\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
