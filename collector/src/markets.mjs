import { gw } from "./gateway.mjs";
import { log } from "./log.mjs";

/**
 * The market list. The trading API and the stats API name spot markets
 * differently (WSOSO_vUSDC vs SOSO/USDC); everything we store uses the stats
 * name so it joins with SoDEX's own daily figures.
 */

const byApi = new Map();

export async function refreshMarkets() {
  let added = 0;
  for (const engine of ["perps", "spot"]) {
    try {
      const rows = await gw(`/${engine}/markets/symbols`, 2);
      for (const r of rows ?? []) {
        if (!byApi.has(r.name)) added++;
        byApi.set(r.name, {
          api: r.name,
          engine,
          symbol: engine === "spot" ? (r.displayName ?? r.name) : r.name,
        });
      }
    } catch (err) {
      log.warn("markets", `could not refresh ${engine} symbols: ${err.message}`);
    }
  }
  if (added) log.info("markets", `${added} market(s) added, ${byApi.size} known`);
  return byApi.size;
}

export const apiNames = (engine) => [...byApi.values()].filter((m) => m.engine === engine).map((m) => m.api);
export const marketOf = (api) => byApi.get(api);
export const displayOf = (api) => byApi.get(api)?.symbol ?? api;
/** The reverse: a stored (stats) name back to the market's API entry. */
export const byDisplay = (symbol) => [...byApi.values()].find((m) => m.symbol === symbol);
export const allMarkets = () => [...byApi.values()];
