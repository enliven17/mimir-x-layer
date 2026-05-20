/**
 * X Layer chain configuration (OKX zkEVM L2, Polygon CDK).
 *
 * Chain ID: 1952 (0x7A0) — X Layer Sepolia (current testnet)
 *           NB: chainid.network lists 195 for an older legacy testnet, but
 *           the live RPC at testrpc.xlayer.tech / xlayertestrpc.okx.com signs
 *           with chain id 1952. Use 1952 here.
 * Native currency: OKB (18 decimals) — used for gas only; stakes are USDC ERC-20
 *
 * X Layer mainnet is chainId 196; we only target the testnet for the hackathon.
 */
import {
  createPublicClient,
  createWalletClient,
  http,
  custom,
  type PublicClient,
  type WalletClient,
  type Chain,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const XLAYER_EXPLORER_URL = "https://www.oklink.com/xlayer-test";

// ── Chain definition ──────────────────────────────────────────────────────────
export const xLayerTestnet: Chain = {
  id: 1952,
  name: "X Layer Testnet",
  nativeCurrency: {
    name: "OKB",
    symbol: "OKB",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ["https://testrpc.xlayer.tech"],
    },
  },
  blockExplorers: {
    default: {
      name: "OKLink",
      url: XLAYER_EXPLORER_URL,
    },
  },
  testnet: true,
};

// Alias kept so older imports continue to compile during the Arc → X Layer cutover.
// New code should import `xLayerTestnet` directly.
export const arcTestnet = xLayerTestnet;

// ── RPC endpoint ──────────────────────────────────────────────────────────────
export function getXLayerRpcUrl(): string {
  return (
    process.env.NEXT_PUBLIC_XLAYER_RPC ||
    (typeof window === "undefined" ? process.env.XLAYER_RPC : undefined) ||
    xLayerTestnet.rpcUrls.default.http[0]
  );
}

// Back-compat alias for files still importing the Arc name.
export const getArcRpcUrl = getXLayerRpcUrl;

export function getContractAddress(): `0x${string}` {
  const addr =
    process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ||
    "0x0000000000000000000000000000000000000000";
  return addr as `0x${string}`;
}

// X Layer testnet RPC (both testrpc.xlayer.tech and xlayertestrpc.okx.com)
// rejects eth_getLogs with "block range greater than 100 max". The chunk size
// here is (limit - 1) blocks so a single [from, to] window stays within the cap.
// The previous 9_999n chunk caused every call to fail with -32602, which is
// why /agents and /stats appeared empty even with on-chain activity.
export const XLAYER_LOG_CHUNK = 99n;
export const ARC_LOG_CHUNK = XLAYER_LOG_CHUNK;

// Default fan-out for paginatedGetLogs. With ~100k blocks of history per
// agent page load (~1000 chunks at chunk=99), sequential requests would take
// minutes. 25 parallel keeps total latency under ~10s without abusing the RPC.
const PAGINATED_LOGS_CONCURRENCY = 25;

export function getDeployBlock(): bigint {
  const raw = process.env.NEXT_PUBLIC_DEPLOY_BLOCK;
  if (raw && raw.trim().length > 0) {
    try {
      return BigInt(raw);
    } catch {
      /* fall through */
    }
  }
  // Set this in .env once the contract is deployed; falls back to a reasonable
  // historical point on X Layer Testnet otherwise.
  return 1n;
}

export async function paginatedGetLogs(
  client: PublicClient,
  params: Omit<Parameters<PublicClient["getLogs"]>[0], "fromBlock" | "toBlock">,
  fromBlock: bigint,
  toBlock?: bigint,
): Promise<any[]> {
  const end = toBlock ?? (await client.getBlockNumber());
  if (fromBlock > end) return [];

  // Build the [start, stop] window list up-front so we can fan out in parallel.
  const windows: Array<{ start: bigint; stop: bigint }> = [];
  for (let start = fromBlock; start <= end; ) {
    const stop = start + XLAYER_LOG_CHUNK > end ? end : start + XLAYER_LOG_CHUNK;
    windows.push({ start, stop });
    start = stop + 1n;
  }

  const results: any[][] = new Array(windows.length);
  let cursor = 0;

  async function worker() {
    while (true) {
      const idx = cursor++;
      if (idx >= windows.length) return;
      const { start, stop } = windows[idx];
      try {
        results[idx] = await client.getLogs({
          ...(params as any),
          fromBlock: start,
          toBlock: stop,
        });
      } catch (err) {
        // Swallow per-chunk failures so a single transient RPC blip doesn't
        // wipe the entire feed. The chunk is just skipped (treated as empty).
        console.error(
          `[paginatedGetLogs] chunk ${start}-${stop} failed:`,
          (err as Error)?.message ?? err,
        );
        results[idx] = [];
      }
    }
  }

  const workerCount = Math.min(PAGINATED_LOGS_CONCURRENCY, windows.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return results.flat();
}

export function getExplorerTxUrl(txHash: string): string {
  return `${XLAYER_EXPLORER_URL}/tx/${txHash}`;
}

export function getExplorerAddressUrl(address: string): string {
  return `${XLAYER_EXPLORER_URL}/address/${address}`;
}

// ── viem clients ──────────────────────────────────────────────────────────────
export function createXLayerPublicClient(): PublicClient {
  return createPublicClient({
    chain: xLayerTestnet,
    transport: http(getXLayerRpcUrl()),
  }) as PublicClient;
}

export const createArcPublicClient = createXLayerPublicClient;

export function createXLayerWalletClient(provider: unknown): WalletClient {
  return createWalletClient({
    chain: xLayerTestnet,
    transport: custom(provider as any),
  });
}

export const createArcWalletClient = createXLayerWalletClient;

export function createXLayerWalletClientWithKey(
  privateKey: string,
): WalletClient {
  const account = privateKeyToAccount(privateKey as `0x${string}`);
  return createWalletClient({
    chain: xLayerTestnet,
    account,
    transport: http(getXLayerRpcUrl()),
  });
}

export const createArcWalletClientWithKey = createXLayerWalletClientWithKey;

// ── MetaMask chain-switch helper ──────────────────────────────────────────────
export async function ensureXLayerChain(ethereum: {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
}): Promise<void> {
  const chainIdHex = `0x${xLayerTestnet.id.toString(16)}`;
  const currentChainId = (await ethereum.request({
    method: "eth_chainId",
  })) as string;

  if (currentChainId === chainIdHex) return;

  try {
    await ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: chainIdHex }],
    });
  } catch (err: any) {
    if (err?.code !== 4902) throw err;
    await ethereum.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: chainIdHex,
          chainName: xLayerTestnet.name,
          rpcUrls: xLayerTestnet.rpcUrls.default.http,
          nativeCurrency: xLayerTestnet.nativeCurrency,
          blockExplorerUrls: [XLAYER_EXPLORER_URL],
        },
      ],
    });
  }
}

export const ensureArcChain = ensureXLayerChain;

// ── Unit helpers ──────────────────────────────────────────────────────────────
// Two currencies are in play on X Layer:
//   - OKB  — native gas token, 18 decimals (used by viem's parseEther/formatEther)
//   - USDC — ERC-20 stake token (USDC_TEST on X Layer Testnet), 6 decimals
//
// Mimir stakes are denominated in USDC. The "micro" helpers below convert
// human-readable USDC amounts (e.g. 2.5) to the on-chain 6-decimal integer
// (2_500_000) and back. They keep their legacy names so the rest of the
// codebase doesn't need a rename pass.

export const OKB_DECIMALS = 18;

export const USDC_DECIMALS = 6;
export const USDC_UNIT = BigInt(10 ** USDC_DECIMALS); // 1_000_000n

// X Layer Testnet USDC (USDC_TEST). Override via NEXT_PUBLIC_USDC_ADDRESS if
// the testnet token migrates or you redeploy against a different stablecoin.
const DEFAULT_USDC_ADDRESS = "0xcB8BF24c6cE16Ad21D707c9505421a17f2bec79D";

export function getUsdcAddress(): `0x${string}` {
  const addr =
    process.env.NEXT_PUBLIC_USDC_ADDRESS ||
    (typeof window === "undefined" ? process.env.USDC_ADDRESS : undefined) ||
    DEFAULT_USDC_ADDRESS;
  return addr as `0x${string}`;
}

/** Human USDC (e.g. 2.5) → 6-decimal integer (2_500_000). */
export function usdcToMicro(usdc: number): bigint {
  if (!Number.isFinite(usdc) || usdc < 0) throw new Error("Invalid USDC amount");
  return BigInt(Math.round(usdc * 1_000_000));
}

/** 6-decimal integer (2_500_000) → human USDC (2.5). */
export function microToUsdc(micro: bigint | number): number {
  return Number(BigInt(micro)) / 1_000_000;
}

export function formatUsdc(micro: bigint | number, decimals = 2): string {
  return microToUsdc(micro).toFixed(decimals) + " USDC";
}

// OKB helpers — used for gas-balance display in the agent dashboards.
export function weiToOkb(wei: bigint | number): number {
  return Number(BigInt(wei)) / 1e18;
}

export function formatOkb(wei: bigint | number, decimals = 4): string {
  return weiToOkb(wei).toFixed(decimals) + " OKB";
}

// Reverse helper for the rare case we need to bundle OKB into a tx.
export function okbToWei(okb: number): bigint {
  if (!Number.isFinite(okb) || okb < 0) throw new Error("Invalid OKB amount");
  return BigInt(Math.round(okb * 1e6)) * BigInt(10 ** 12);
}

// ── ERC-20 ABI fragment ──────────────────────────────────────────────────────
// Tiny ABI used by the agents and the frontend for approve/balance/decimals.
export const ERC20_MIN_ABI = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount",  type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner",   type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
] as const;
