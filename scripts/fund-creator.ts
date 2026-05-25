/**
 * One-shot: transfer USDC from the oracle wallet to the market-creator wallet
 * so demo / market-creator runs have stake available. Useful when the creator
 * wallet hasn't been topped up from the faucet directly.
 *
 * Run: npx tsx --env-file-if-exists=.env.local scripts/fund-creator.ts [amount]
 *   default amount: 3 (USDC)
 */

import { encodeFunctionData, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  createArcPublicClient,
  ERC20_MIN_ABI,
  formatUsdc,
  getExplorerTxUrl,
  getUsdcAddress,
  usdcToMicro,
  xLayerTestnet,
} from "../lib/arc";

// ERC20_MIN_ABI in lib/xlayer.ts has approve/allowance/balanceOf/decimals/symbol
// but no `transfer` — agents only ever need approve+transferFrom. We need
// transfer here, so declare a local one-function ABI.
const ERC20_TRANSFER_ABI = parseAbi([
  "function transfer(address to, uint256 amount) returns (bool)",
]);
import {
  getMarketCreatorAddress,
  getOracleWalletId,
} from "../lib/circle-w3s";

const AMOUNT_USDC = Number(process.argv[2] ?? "3");

async function main() {
  if (!Number.isFinite(AMOUNT_USDC) || AMOUNT_USDC <= 0) {
    throw new Error(`Invalid amount: ${process.argv[2]}`);
  }

  const pk = process.env.ORACLE_PRIVATE_KEY?.trim();
  if (!pk) throw new Error("ORACLE_PRIVATE_KEY missing in env.");

  const account = privateKeyToAccount(pk as `0x${string}`);
  const client = createArcPublicClient();
  const usdc = getUsdcAddress();
  const creatorAddr = getMarketCreatorAddress();
  const amount = usdcToMicro(AMOUNT_USDC);

  // Read pre-balances so the printout is meaningful
  const [oracleBalBefore, creatorBalBefore] = await Promise.all([
    client.readContract({
      address: usdc,
      abi: ERC20_MIN_ABI,
      functionName: "balanceOf",
      args: [account.address],
    }) as Promise<bigint>,
    client.readContract({
      address: usdc,
      abi: ERC20_MIN_ABI,
      functionName: "balanceOf",
      args: [creatorAddr],
    }) as Promise<bigint>,
  ]);

  console.log(`Oracle  (${account.address}) USDC: ${formatUsdc(oracleBalBefore)}`);
  console.log(`Creator (${creatorAddr}) USDC: ${formatUsdc(creatorBalBefore)}`);
  console.log(`Transferring ${AMOUNT_USDC} USDC oracle → creator…\n`);

  if (oracleBalBefore < amount) {
    throw new Error(
      `Oracle has ${formatUsdc(oracleBalBefore)}, needs ${AMOUNT_USDC} USDC.`,
    );
  }

  const data = encodeFunctionData({
    abi: ERC20_TRANSFER_ABI,
    functionName: "transfer",
    args: [creatorAddr, amount],
  });

  const [nonce, gasPrice, gas] = await Promise.all([
    client.getTransactionCount({ address: account.address, blockTag: "pending" }),
    client.getGasPrice(),
    client.estimateGas({ account: account.address, to: usdc, data, value: 0n }),
  ]);

  const serialized = await account.signTransaction({
    type: "legacy",
    chainId: xLayerTestnet.id,
    nonce,
    gas,
    gasPrice,
    to: usdc,
    data,
    value: 0n,
  });

  const hash = await client.sendRawTransaction({ serializedTransaction: serialized });
  console.log(`tx: ${getExplorerTxUrl(hash)}`);
  await client.waitForTransactionReceipt({ hash });

  const creatorBalAfter = (await client.readContract({
    address: usdc,
    abi: ERC20_MIN_ABI,
    functionName: "balanceOf",
    args: [creatorAddr],
  })) as bigint;
  console.log(`\n✓ Creator now holds ${formatUsdc(creatorBalAfter)}`);
}

main().catch((e) => {
  console.error("fund-creator failed:", e?.message ?? e);
  process.exit(1);
});
