/**
 * ValueChain reads — the chain SoDEX itself settles on.
 *
 * Some balances a wallet holds on SoDEX are NOT spot balances and therefore
 * never appear in the trading API:
 *
 *   /spot/markets/coins            → the tradeable coin list (WSOSO is in it, sSOSO is not)
 *   /spot/accounts/{addr}/balances → "List of non zero balances" for those coins only
 *
 * sSOSO ("Staked SOSO") is the receipt token minted 1:1 when SOSO is staked on
 * SoDEX. It lives as a plain ERC-20 on ValueChain, not in the spot ledger, so
 * the only way to read it is an `eth_call` against the token contract. It is
 * also what sets the `stakingTier` reported by /spot/accounts/{addr}/fee-rate —
 * verified against live wallets: 0 sSOSO → tier 0, ~300 → tier 2, ~3050 → tier 3.
 */

import { cachedFetchJson } from "@/lib/fetchCache";

const RPC_URL = "https://mainnet.valuechain.xyz/";

/** sSOSO — "Staked SOSO", 18 decimals. ERC-20 on ValueChain (chain id 286623). */
const SSOSO_CONTRACT = "0xb04eB6b64137d1673D46731C8f84718092c50B0D";
const SSOSO_DECIMALS = 18;

/**
 * Spot coin sSOSO is priced against. SoDEX prices staked SOSO off the
 * WSOSO_vUSDC book (1 sSOSO tracks 1 WSOSO), so the ticker map the holdings
 * card already builds covers it — no extra price feed needed.
 */
export const SSOSO_PRICE_COIN = "WSOSO";

/** Asset string for the synthetic holdings row (resolves to the SOSO icon). */
export const SSOSO_COIN = "sSOSO";

const BALANCE_OF = "0x70a08231"; // balanceOf(address)

const RPC_TTL = 60 * 1000;

interface RpcResponse {
  result?: string;
  error?: { code: number; message: string };
}

/** Read-only `eth_call` against ValueChain. The RPC is CORS-open, so this runs client-side. */
async function ethCall(to: string, data: string): Promise<string | null> {
  const body = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "eth_call",
    params: [{ to, data }, "latest"],
  });
  try {
    const res = await cachedFetchJson<RpcResponse>(
      RPC_URL,
      { method: "POST", headers: { "Content-Type": "application/json" }, body },
      RPC_TTL,
    );
    if (res.error || !res.result) return null;
    return res.result;
  } catch {
    return null;
  }
}

/** Convert a uint256 hex word to a JS number, scaled down by `decimals`. */
function fromWei(hex: string, decimals: number): number {
  // BigInt literals (0n) aren't allowed at this tsconfig target — use BigInt().
  const raw = BigInt(hex);
  const zero = BigInt(0);
  if (raw === zero) return 0;
  const scale = BigInt(10) ** BigInt(decimals);
  const whole = raw / scale;
  const frac = raw % scale;
  return Number(whole) + Number(frac) / Number(scale);
}

/**
 * Staked SOSO held by `address`, in whole sSOSO. Returns 0 when the wallet has
 * never staked — and also when the RPC is unreachable, so a dead node degrades
 * to "no staked row" rather than breaking the holdings card.
 */
export async function fetchStakedSoso(address: string): Promise<number> {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) return 0;
  const data = BALANCE_OF + "000000000000000000000000" + address.slice(2).toLowerCase();
  const hex = await ethCall(SSOSO_CONTRACT, data);
  if (!hex) return 0;
  return fromWei(hex, SSOSO_DECIMALS);
}
