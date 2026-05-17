/**
 * wagmi config for Mimir on X Layer.
 *
 * Supports: MetaMask, OKX Wallet, Coinbase Wallet, injected wallets.
 * Primary (and only) chain: X Layer Testnet (195), OKB native (18 decimals).
 *
 * No cross-chain bridge — users on-ramp OKB directly via the OKX faucet
 * (https://www.okx.com/xlayer/faucet) or by withdrawing from an OKX account.
 */
import { createConfig, http } from "wagmi";
import { coinbaseWallet, injected, metaMask } from "@wagmi/connectors";
import { xLayerTestnet, getXLayerRpcUrl } from "./xlayer";

export const wagmiConfig = createConfig({
  chains: [xLayerTestnet],
  connectors: [
    metaMask(),
    coinbaseWallet({
      appName: "Mimir",
      appLogoUrl: "https://mimir.app/logo.png",
    }),
    // OKX Wallet exposes window.okxwallet — `injected` picks it up by default,
    // and many users will also have it as the default injected provider.
    injected({ target: "okxWallet" as any }),
    injected(),
  ],
  transports: {
    [xLayerTestnet.id]: http(getXLayerRpcUrl()),
  },
  ssr: true,
});
