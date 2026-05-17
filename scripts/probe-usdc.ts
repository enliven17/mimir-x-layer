/**
 * One-shot probe to read symbol/decimals/balance from the X Layer Testnet
 * USDC contract. Confirms the address is alive and tells us the exact
 * decimal precision before we hard-code it in the contract.
 *
 * Run: npx tsx scripts/probe-usdc.ts
 */

import { readFileSync, existsSync } from "fs";
import * as path from "path";
import { parseAbi, formatUnits, getAddress } from "viem";
import { createXLayerPublicClient } from "../lib/xlayer";

const USDC = "0xcb8bf24c6ce16ad21d707c9505421a17f2bec79d";

const ERC20_ABI = parseAbi([
  "function symbol() view returns (string)",
  "function name() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
  "function totalSupply() view returns (uint256)",
]);

async function main() {
  const client = createXLayerPublicClient();
  const addr = getAddress(USDC);

  const [name, symbol, decimals, totalSupply] = await Promise.all([
    client.readContract({ address: addr, abi: ERC20_ABI, functionName: "name" }),
    client.readContract({ address: addr, abi: ERC20_ABI, functionName: "symbol" }),
    client.readContract({ address: addr, abi: ERC20_ABI, functionName: "decimals" }),
    client.readContract({ address: addr, abi: ERC20_ABI, functionName: "totalSupply" }),
  ]);

  console.log("\nX Layer Testnet USDC probe");
  console.log("─────────────────────────────────────────────");
  console.log(`  Address      : ${addr}`);
  console.log(`  Name         : ${name}`);
  console.log(`  Symbol       : ${symbol}`);
  console.log(`  Decimals     : ${decimals}`);
  console.log(`  Total supply : ${formatUnits(totalSupply as bigint, decimals as number)} ${symbol}`);
  console.log("─────────────────────────────────────────────");

  // Optional: also probe local wallet balances if present
  const walletsPath = path.resolve(process.cwd(), "wallets.local.json");
  if (existsSync(walletsPath)) {
    const w = JSON.parse(readFileSync(walletsPath, "utf-8")) as any;
    const rows = [
      ["deployer       ", w.deployer.address],
      ["oracle         ", w.oracle.address],
      ["market-creator ", w.marketCreator.address],
    ] as Array<[string, `0x${string}`]>;

    console.log("\nLocal wallet USDC balances:");
    console.log("─────────────────────────────────────────────");
    for (const [label, address] of rows) {
      const bal = (await client.readContract({
        address: addr,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [address],
      })) as bigint;
      console.log(`  ${label} ${address}   ${formatUnits(bal, decimals as number)} ${symbol}`);
    }
    console.log("─────────────────────────────────────────────\n");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
