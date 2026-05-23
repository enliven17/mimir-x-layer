"use client";

/**
 * Wallet context — powered by wagmi
 *
 * Supports MetaMask, Coinbase Wallet, Phantom, and any injected wallet.
 * Keeps the same useWallet() API so the rest of the app is unchanged.
 *
 * Behaviour: after a connection lands on a chain that isn't X Layer Testnet,
 * we proactively prompt the wallet to switch. wagmi's switchChain is tried
 * first; if that throws (some injected wallets — notably OKX — surface only
 * the raw EIP-1193 methods), we fall back to a manual
 * wallet_switchEthereumChain + wallet_addEthereumChain dance via the
 * injected provider.
 */
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  useAccount,
  useConnect,
  useDisconnect,
  useSwitchChain,
} from "wagmi";
import { ensureXLayerChain, xLayerTestnet } from "./xlayer";

interface WalletCtx {
  address: string | null;
  isConnected: boolean;
  isConnecting: boolean;
  isCorrectNetwork: boolean;
  /** When the user is connected but the wallet is on a non-X-Layer chain. */
  isWrongNetwork: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
  switchNetwork: () => Promise<void>;
  /** True while switchNetwork() is in flight. */
  isSwitching: boolean;
  error: string | null;
  /** Available connectors (MetaMask, Coinbase, etc.) */
  connectors: Array<{ id: string; name: string; connect: () => void }>;
}

const Ctx = createContext<WalletCtx>({
  address: null,
  isConnected: false,
  isConnecting: false,
  isCorrectNetwork: true,
  isWrongNetwork: false,
  connect: async () => {},
  disconnect: () => {},
  switchNetwork: async () => {},
  isSwitching: false,
  error: null,
  connectors: [],
});

// Manual EIP-1193 fallback for wallets that don't cleanly accept wagmi's
// switchChain (OKX Wallet historically needs this).
async function injectedSwitchToXLayer(): Promise<void> {
  if (typeof window === "undefined") return;
  const w = window as unknown as {
    ethereum?: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> };
    okxwallet?: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> };
  };
  const provider = w.okxwallet ?? w.ethereum;
  if (!provider?.request) throw new Error("no injected provider");
  await ensureXLayerChain(provider);
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const { address, isConnected, chain } = useAccount();
  const { connect, connectors, isPending, error: connectError } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: isSwitching } = useSwitchChain();

  const isCorrectNetwork = !chain || chain.id === xLayerTestnet.id;
  const isWrongNetwork   = isConnected && !!chain && chain.id !== xLayerTestnet.id;

  // Try X Layer once per **distinct** wrong chain id. If the user rejects we
  // don't loop, but if they later move to a different wrong chain we try
  // again — and the manual "Switch to X Layer" CTA in the header is always
  // available too.
  const attemptedForChain = useRef<number | null>(null);
  useEffect(() => {
    if (!isConnected || !chain) {
      attemptedForChain.current = null;
      return;
    }
    if (chain.id === xLayerTestnet.id) return;
    if (attemptedForChain.current === chain.id) return;
    attemptedForChain.current = chain.id;

    switchChain(
      { chainId: xLayerTestnet.id },
      {
        onError: () => {
          // wagmi failed (unsupported method / wallet quirk). Try the raw
          // EIP-1193 path. If that also throws, the user-facing CTA stays
          // available; we don't pester further.
          injectedSwitchToXLayer().catch(() => {});
        },
      },
    );
  }, [isConnected, chain, switchChain]);

  const connectWithFirstAvailable = async () => {
    // Try MetaMask first, then Coinbase, then any injected
    const preferred = connectors.find((c) => c.id === "metaMask")
      ?? connectors.find((c) => c.id === "coinbaseWallet")
      ?? connectors[0];
    if (preferred) {
      connect({ connector: preferred });
    }
  };

  const [switchError, setSwitchError] = useState<string | null>(null);
  const switchNetwork = async () => {
    setSwitchError(null);
    // Reset the per-chain attempt flag so the user can re-trigger after
    // rejecting once.
    if (chain?.id) attemptedForChain.current = null;
    try {
      switchChain(
        { chainId: xLayerTestnet.id },
        {
          onError: async () => {
            try {
              await injectedSwitchToXLayer();
            } catch (err: any) {
              setSwitchError(err?.message ?? "switch failed");
            }
          },
        },
      );
    } catch (err: any) {
      // Fall straight to the injected path if wagmi throws synchronously.
      try {
        await injectedSwitchToXLayer();
      } catch (e: any) {
        setSwitchError(e?.message ?? err?.message ?? "switch failed");
      }
    }
  };

  const connectorList = useMemo(
    () =>
      connectors.map((c) => ({
        id: c.id,
        name: c.name,
        connect: () => connect({ connector: c }),
      })),
    [connectors, connect]
  );

  const error = connectError
    ? connectError.message.includes("rejected")
      ? "rejected"
      : "error"
    : switchError;

  return (
    <Ctx.Provider
      value={{
        address: address ?? null,
        isConnected,
        isConnecting: isPending,
        isCorrectNetwork,
        isWrongNetwork,
        connect: connectWithFirstAvailable,
        disconnect,
        switchNetwork,
        isSwitching,
        error,
        connectors: connectorList,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useWallet() {
  return useContext(Ctx);
}
