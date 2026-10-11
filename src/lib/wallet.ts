import { createConfig, http, injected } from "wagmi";
import { defineChain } from "viem";

/**
 * Wallet connection.
 *
 * SoDEX accounts are plain EVM addresses, so connecting only needs the
 * address — nothing here asks the wallet to switch network or sign. ValueChain
 * is declared because wagmi needs at least one chain, and it is the chain any
 * later signing (builder approval, orders) will be done against.
 *
 * Only injected wallets for now: browser extensions (MetaMask, Rabby, OKX…)
 * and the in-app browsers of mobile wallets. wagmi discovers each installed
 * extension separately through EIP-6963, so they list by name. A QR code for
 * mobile wallets outside their own browser needs WalletConnect, which needs a
 * project ID from Reown.
 */

export const valuechain = defineChain({
  id: 286623,
  name: "ValueChain",
  nativeCurrency: { name: "SOSO", symbol: "SOSO", decimals: 18 },
  rpcUrls: { default: { http: ["https://mainnet.valuechain.xyz"] } },
});

export const walletConfig = createConfig({
  chains: [valuechain],
  connectors: [injected()],
  transports: { [valuechain.id]: http() },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof walletConfig;
  }
}
