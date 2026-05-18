/**
 * Agent signer for Mimir on X Layer.
 *
 * Replaces the original Circle W3S-backed signer with a vanilla viem + private
 * key implementation. The exported API is intentionally identical so the
 * oracle and market-creator agents compile without changes:
 *
 *   - executeContract({ walletId, contractAddress, abiFunctionSignature,
 *                       abiParameters, amount? }) → tx hash
 *   - buildAbiFunctionSignature(fnName, abi)
 *   - toCircleAbiParameters(args)
 *   - getOracleWalletId() / getOracleAddress()
 *   - getMarketCreatorWalletId() / getMarketCreatorAddress()
 *
 * `walletId` is now a logical label ("oracle" | "creator") that maps to a
 * private key from env (ORACLE_PRIVATE_KEY / CREATOR_PRIVATE_KEY) or, in dev,
 * from wallets.local.json. The agents never see the raw key.
 */

import { existsSync, readFileSync } from "node:fs";
import * as path from "node:path";
import {
  decodeFunctionData,
  encodeFunctionData,
  maxUint256,
  parseAbi,
  parseAbiItem,
  parseEther,
  type Abi,
  type AbiFunction,
  type AbiParameter,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  ERC20_MIN_ABI,
  createXLayerPublicClient,
  createXLayerWalletClientWithKey,
  getUsdcAddress,
  xLayerTestnet,
} from "./xlayer";

// ── Logical wallet ids ────────────────────────────────────────────────────────
// These are the strings the agents pass as `walletId`. They have no on-chain
// meaning — they're just lookup keys into our local private-key store.
export const ORACLE_WALLET_ID = "oracle";
export const CREATOR_WALLET_ID = "creator";

// ── Private-key resolution ────────────────────────────────────────────────────
// Resolution order (first hit wins):
//   1. Env var (ORACLE_PRIVATE_KEY / CREATOR_PRIVATE_KEY)
//   2. wallets.local.json at the repo root (dev convenience, git-ignored)

let cachedLocalWallets:
  | { oracle?: { privateKey: string }; marketCreator?: { privateKey: string } }
  | null = null;
let triedLocalWallets = false;

function loadLocalWallets() {
  if (triedLocalWallets) return cachedLocalWallets;
  triedLocalWallets = true;
  const file = path.resolve(process.cwd(), "wallets.local.json");
  if (!existsSync(file)) return null;
  try {
    cachedLocalWallets = JSON.parse(readFileSync(file, "utf-8"));
  } catch {
    cachedLocalWallets = null;
  }
  return cachedLocalWallets;
}

function getPrivateKey(walletId: string): Hex {
  if (walletId === ORACLE_WALLET_ID) {
    const fromEnv = process.env.ORACLE_PRIVATE_KEY?.trim();
    if (fromEnv) return fromEnv as Hex;
    const local = loadLocalWallets();
    if (local?.oracle?.privateKey) return local.oracle.privateKey as Hex;
    throw new Error(
      "Oracle private key missing. Set ORACLE_PRIVATE_KEY in .env.local " +
        "or generate one with `npx tsx scripts/generate-wallets.ts`.",
    );
  }
  if (walletId === CREATOR_WALLET_ID) {
    const fromEnv = process.env.CREATOR_PRIVATE_KEY?.trim();
    if (fromEnv) return fromEnv as Hex;
    const local = loadLocalWallets();
    if (local?.marketCreator?.privateKey)
      return local.marketCreator.privateKey as Hex;
    throw new Error(
      "Market-creator private key missing. Set CREATOR_PRIVATE_KEY in .env.local " +
        "or generate one with `npx tsx scripts/generate-wallets.ts`.",
    );
  }
  throw new Error(`Unknown walletId: ${walletId}`);
}

// ── Address helpers ───────────────────────────────────────────────────────────
function deriveAddress(walletId: string): `0x${string}` {
  return privateKeyToAccount(getPrivateKey(walletId)).address;
}

export function getOracleWalletId(): string {
  return ORACLE_WALLET_ID;
}

export function getOracleAddress(): `0x${string}` {
  const fromEnv = process.env.ORACLE_ADDRESS?.trim();
  if (fromEnv) return fromEnv as `0x${string}`;
  return deriveAddress(ORACLE_WALLET_ID);
}

export function getMarketCreatorWalletId(): string {
  return CREATOR_WALLET_ID;
}

export function getMarketCreatorAddress(): `0x${string}` {
  const fromEnv = process.env.CREATOR_ADDRESS?.trim();
  if (fromEnv) return fromEnv as `0x${string}`;
  return deriveAddress(CREATOR_WALLET_ID);
}

// ── ABI helpers (kept identical to the Circle-era helpers) ────────────────────
export function buildAbiFunctionSignature(
  fnName: string,
  abi: ReadonlyArray<unknown>,
): string {
  const fn = abi.find(
    (item): item is AbiFunction =>
      typeof item === "object" &&
      item !== null &&
      (item as AbiFunction).type === "function" &&
      (item as AbiFunction).name === fnName,
  );
  if (!fn) throw new Error(`Function ${fnName} not found in ABI`);
  const types = (fn.inputs as AbiParameter[]).map((i) => i.type).join(",");
  return `${fnName}(${types})`;
}

export function toCircleAbiParameters(args: readonly unknown[]): unknown[] {
  // viem accepts bigints natively, but agents may still pass strings; keep the
  // identity transform so callers don't need to change.
  return args.map((a) => a);
}

// ── Contract execution ────────────────────────────────────────────────────────
export interface ExecuteContractArgs {
  /** Logical wallet id (e.g. "oracle" or "creator"). */
  walletId: string;
  contractAddress: `0x${string}`;
  /** e.g. "resolveClaim(uint256,uint8,string,uint8,bytes32)" */
  abiFunctionSignature: string;
  abiParameters: unknown[];
  /** Decimal-string OKB amount (e.g. "0.5") to attach as msg.value. */
  amount?: string;
  feeLevel?: "LOW" | "MEDIUM" | "HIGH";
  refId?: string;
}

/**
 * Submit a contract write and wait for one confirmation.
 * Mirrors the W3S-era surface but uses viem + a local private key.
 *
 * X Layer Testnet's RPC rejects EIP-1559 (type 2) transactions and only
 * accepts EIP-155 legacy ones. We sign+send manually so the chain id is
 * baked into the signature and nonce uses the pending block.
 */
export async function executeContract(args: ExecuteContractArgs): Promise<Hex> {
  const pk = getPrivateKey(args.walletId);
  const account = privateKeyToAccount(pk);
  const publicClient = createXLayerPublicClient();

  // Reconstruct an Abi from the signature string so viem can encode the call.
  const item = parseAbiItem(`function ${args.abiFunctionSignature}`);
  const abi = [item] as Abi;
  const fnName = args.abiFunctionSignature.split("(")[0];

  const data = encodeFunctionData({
    abi,
    functionName: fnName,
    args: args.abiParameters as any,
  });

  const value = args.amount ? parseEther(args.amount) : 0n;

  const hash = await signAndSendLegacy({
    account,
    to: args.contractAddress,
    data,
    value,
    publicClient,
  });

  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

interface LegacySendArgs {
  account: ReturnType<typeof privateKeyToAccount>;
  to: `0x${string}`;
  data: `0x${string}`;
  value?: bigint;
  publicClient: ReturnType<typeof createXLayerPublicClient>;
}

async function signAndSendLegacy(args: LegacySendArgs): Promise<Hex> {
  const [nonce, gasPrice, gas] = await Promise.all([
    args.publicClient.getTransactionCount({
      address: args.account.address,
      blockTag: "pending",
    }),
    args.publicClient.getGasPrice(),
    args.publicClient.estimateGas({
      account: args.account.address,
      to: args.to,
      data: args.data,
      value: args.value ?? 0n,
    }),
  ]);

  const serialized = await args.account.signTransaction({
    type: "legacy",
    chainId: xLayerTestnet.id,
    nonce,
    gas,
    gasPrice,
    to: args.to,
    data: args.data,
    value: args.value ?? 0n,
  });

  return args.publicClient.sendRawTransaction({ serializedTransaction: serialized });
}

// ── USDC approve helper ───────────────────────────────────────────────────────
/**
 * Ensure the given wallet has approved `spender` to pull at least `amount`
 * USDC. Issues an unlimited (max-uint256) approval if the current allowance
 * is short, so subsequent stakes don't need another approve.
 */
export async function ensureUsdcAllowance(
  walletId: string,
  spender: `0x${string}`,
  amount: bigint,
): Promise<Hex | null> {
  const pk = getPrivateKey(walletId);
  const account = privateKeyToAccount(pk);
  const publicClient = createXLayerPublicClient();
  const usdc = getUsdcAddress();

  const current = (await publicClient.readContract({
    address: usdc,
    abi: ERC20_MIN_ABI,
    functionName: "allowance",
    args: [account.address, spender],
  })) as bigint;

  if (current >= amount) return null; // already enough

  const data = encodeFunctionData({
    abi: ERC20_MIN_ABI,
    functionName: "approve",
    args: [spender, maxUint256],
  });

  const hash = await signAndSendLegacy({ account, to: usdc, data, publicClient });
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

/** Read the agent wallet's USDC balance (6-decimal integer). */
export async function getUsdcBalance(walletId: string): Promise<bigint> {
  const account = privateKeyToAccount(getPrivateKey(walletId));
  const publicClient = createXLayerPublicClient();
  return (await publicClient.readContract({
    address: getUsdcAddress(),
    abi: ERC20_MIN_ABI,
    functionName: "balanceOf",
    args: [account.address],
  })) as bigint;
}

// ── Wallet info (kept for diagnostic scripts) ─────────────────────────────────
export async function getWalletInfo(walletId: string) {
  return {
    id: walletId,
    address: deriveAddress(walletId),
    blockchain: "XLAYER-TESTNET",
    state: "LIVE",
  };
}

// Re-export decoder helpers some scripts use.
export { decodeFunctionData, parseAbi };
