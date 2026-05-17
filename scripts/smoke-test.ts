/**
 * End-to-end smoke test: opens one claim on-chain to validate the entire
 * USDC approve + createClaim flow against the live X Layer Testnet contract.
 *
 * Uses the market-creator wallet from wallets.local.json. Stakes 1 USDC,
 * deadline 1 hour out. Prints tx hashes for both the approve and the create.
 *
 * Run: npx tsx --env-file-if-exists=.env.local scripts/smoke-test.ts
 */

import { readFileSync } from "fs";
import * as path from "path";
import {
  createPublicClient,
  createWalletClient,
  http,
  maxUint256,
  parseAbi,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  xLayerTestnet,
  getXLayerRpcUrl,
  getContractAddress,
  getUsdcAddress,
  ERC20_MIN_ABI,
  usdcToMicro,
} from "../lib/xlayer";
import { MIMIR_ABI } from "../lib/mimir-abi";

const WALLETS = JSON.parse(
  readFileSync(path.resolve(process.cwd(), "wallets.local.json"), "utf-8"),
);

const account = privateKeyToAccount(WALLETS.marketCreator.privateKey);
const rpc     = getXLayerRpcUrl();
const usdc    = getUsdcAddress();
const mimir   = getContractAddress();

const publicClient = createPublicClient({
  chain: xLayerTestnet,
  transport: http(rpc),
});

const walletClient = createWalletClient({
  chain: xLayerTestnet,
  transport: http(rpc),
  account,
});

async function send(label: string, p: { to: `0x${string}`; data: `0x${string}` }) {
  const [nonce, gasPrice, gas] = await Promise.all([
    // Use `pending` so back-to-back tx don't reuse the same nonce.
    publicClient.getTransactionCount({ address: account.address, blockTag: "pending" }),
    publicClient.getGasPrice(),
    publicClient.estimateGas({ account: account.address, to: p.to, data: p.data }),
  ]);
  const serialized = await account.signTransaction({
    type: "legacy",
    chainId: xLayerTestnet.id,
    to: p.to,
    data: p.data,
    nonce,
    gas,
    gasPrice,
    value: 0n,
  });
  const hash = await publicClient.sendRawTransaction({ serializedTransaction: serialized });
  console.log(`  ${label} → ${hash}`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status === "reverted") throw new Error(`${label} reverted`);
  console.log(`    ✓ confirmed in block ${receipt.blockNumber}`);
  return hash;
}

async function main() {
  console.log("\nMimir × X Layer — smoke test");
  console.log("────────────────────────────────────────");
  console.log(`  Network  : X Layer Testnet (${xLayerTestnet.id})`);
  console.log(`  Mimir    : ${mimir}`);
  console.log(`  USDC     : ${usdc}`);
  console.log(`  Sender   : ${account.address}`);
  console.log("────────────────────────────────────────\n");

  // 1. Encode + send approve(Mimir, max)
  const { encodeFunctionData } = await import("viem");
  const approveData = encodeFunctionData({
    abi: ERC20_MIN_ABI,
    functionName: "approve",
    args: [mimir, maxUint256],
  });
  console.log("1. approve USDC for Mimir contract");
  await send("approve", { to: usdc, data: approveData });

  // 2. Encode + send createClaim(...)
  const stake    = usdcToMicro(1);                            // 1 USDC
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600); // 1h
  const createData = encodeFunctionData({
    abi: MIMIR_ABI,
    functionName: "createClaim",
    args: [
      "Will BTC be above $90,000 on https://www.coingecko.com/en/coins/bitcoin one hour from now?",
      "Yes — BTC is currently above $90,000 and unlikely to drop more than ~5% in the next hour.",
      "No — BTC will close below $90,000 before the deadline.",
      "https://www.coingecko.com/en/coins/bitcoin",
      deadline,
      stake,
      "crypto",
      0n,
      "binary",
      "pool",
      0n,
      "",
      "Resolve YES if the BTC price shown on CoinGecko is at or above 90,000 USD at the deadline timestamp.",
      100n,
      false,
      "",
    ],
  });
  console.log("\n2. createClaim — 1 USDC stake, 1h deadline");
  await send("createClaim", { to: mimir, data: createData });

  // 3. Verify on-chain
  const claimCount = (await publicClient.readContract({
    address: mimir,
    abi: MIMIR_ABI,
    functionName: "claimCount",
  })) as bigint;
  console.log(`\n3. on-chain claim count: ${claimCount}`);

  console.log("\n✓ Smoke test passed. The Mimir contract is live on X Layer Testnet.");
  console.log(`  https://www.oklink.com/xlayer-test/address/${mimir}\n`);
}

main().catch((err) => {
  console.error("\n✗ Smoke test failed:", err?.shortMessage ?? err?.message ?? err);
  process.exit(1);
});
