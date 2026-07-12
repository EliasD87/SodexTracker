/**
 * Token icon resolution for SoDEX symbols.
 *
 * SoDEX names a token differently depending on context:
 *   - Perps:    "BTC-USD"           (name / displayName)  → base before "-"
 *   - Spot:     "BTC/USDC"          (displayName)         → base before "/"
 *   - Spot:     "vBTC_vUSDC"/"vBTC" (name / baseCoin)     → before "_", strip "v"
 *   - Balances: "vLINK", "vDEFI.ssi", "WSOSO", "vUSDC" (B[].a) → strip "v" / ".ssi"
 *
 * `getTokenIcon(raw)` accepts any of these and returns the icon URL, or null.
 */

// Canonical key (lowercase base coin) → image URL.
const ICONS: Record<string, string> = {
  btc: "https://static.sosovalue.com/sosponge/droplist/23/06/13/k5xwt0j0fw1z.png",
  eth: "https://static.sosovalue.com/sosponge/droplist/23/06/13/jhgqt0j0fwmv.png",
  xaut: "https://static.sosovalue.com/sosponge/droplist/23/06/13/xzfgt0j0fwjf.png",
  sol: "https://static.sosovalue.com/sosponge/droplist/23/06/13/on5kt0j0fwos.png",
  us500: "https://sodex.com/assets/img/tokens/us500.svg",
  doge: "https://static.sosovalue.com/sosponge/droplist/23/06/13/9yudt0j0fw6a.png",
  hype: "https://static.sosovalue.com/sosovalue/2024/11/30/thumbnails/ca6c1a81-2996-4beb-a728-503f85b7f269.jpg",
  bnb: "https://static.sosovalue.com/sosponge/droplist/23/06/13/6iuct0j0fwow.png",
  ada: "https://static.sosovalue.com/sosponge/droplist/23/06/13/j3bxt0j0fw4s.png",
  xrp: "https://static.sosovalue.com/sosponge/droplist/23/06/13/0ftqt0j0fwx2.png",
  sui: "https://static.sosovalue.com/sosponge/droplist/23/06/13/mnkqt0j0fwdg.png",
  link: "https://static.sosovalue.com/sosovalue/2025/08/07/e9d5b411-ed0f-4520-a36c-f6a8077dab3a.png",
  ondo: "https://static.sosovalue.com/nftdrop-pad/2024/02/04/3c840b94-2504-4c15-8a40-2191b9c6b5bd.png",
  virtual: "https://static.sosovalue.com/sosovalue/web3image/24/03/25/p08otmdfywr2.png",
  pump: "https://static.sosovalue.com/sosovalue/2025/08/07/4f5bd56f-63df-40d1-9c24-51731b17f7be.jpg",
  wld: "https://static.sosovalue.com/sosovalue/2024/04/18/913803e4-2e87-46eb-be52-b5b037a5094d.jpg",
  fartcoin: "https://static.sosovalue.com/sosovalue/web3image/24/10/28/fcoftt84wolh.png",
  ltc: "https://static.sosovalue.com/sosponge/droplist/23/06/13/9jb4t0j0fwoo.png",
  aster: "https://static.sosovalue.com/2026/01/23/f26c0777-691e-4c3e-ba58-bd785c28ce5f.png",
  chz: "https://static.sosovalue.com/sosponge/droplist/23/06/13/irrpt0j0fws6.png",
  lit: "https://static.sosovalue.com/2026/01/23/e1fd0b5e-5066-4f23-8919-03946f142dc8.png",
  xpl: "https://static.sosovalue.com/2026/01/23/fee380a6-b204-4897-a844-df9e5425322f.png",
  mon: "https://static.sosovalue.com/2026/01/22/ee873348-633f-440c-a97d-7564ad54d88d.png",
  apt: "https://static.sosovalue.com/sosponge/droplist/23/06/13/eie6t0j0fwek.png",
  wlfi: "https://static.sosovalue.com/sosovalue/2025/09/01/dd5400ac-1077-4978-a6d3-8f2047577737.png",
  "1000pepe": "https://static.sosovalue.com/sosponge/droplist/23/06/13/46f8t0j0fwq5.png",
  bch: "https://static.sosovalue.com/sosponge/droplist/23/06/13/uahot0j0fwq3.png",
  cl: "https://sodex.com/assets/img/tokens/cl.svg",
  trump: "https://static.sosovalue.com/sosovalue/2025/01/18/abbd14c6-b5fa-45f4-b501-25fc5ce0380d.jpg",
  arb: "https://static.sosovalue.com/sosponge/droplist/23/06/13/7izvt0j0fwp0.png",
  aave: "https://static.sosovalue.com/sosponge/droplist/23/06/13/avict0j0fwri.png",
  pengu: "https://static.sosovalue.com/sosovalue/2024/12/17/thumbnails/0528d828-f99a-445b-9e44-93ec342a75e8.png",
  op: "https://static.sosovalue.com/sosponge/droplist/23/06/13/9dr9t0j0fw0j.png",
  fil: "https://static.sosovalue.com/sosponge/droplist/23/06/13/znmqt0j0fwqh.png",
  "1000shib": "https://static.sosovalue.com/sosponge/droplist/23/06/13/isb9t0j0fwsh.png",
  wif: "https://static.sosovalue.com/sosponge/droplist/23/12/25/tfirt0hn0w6x.png",
  trx: "https://static.sosovalue.com/sosovalue/2025/08/07/bb6455a2-bf56-404d-8de8-8640c75504b0.png",
  hbar: "https://static.sosovalue.com/sosponge/droplist/23/06/13/5gwgt0j0fw5s.png",
  xlm: "https://static.sosovalue.com/sosovalue/2025/08/07/b64979f2-514b-4dbb-afd9-1a416334faf5.jpg",
  uni: "https://static.sosovalue.com/sosponge/droplist/23/06/13/hpxct0j0fwby.png",
  ena: "https://static.sosovalue.com/sosovalue/2024/04/02/thumbnails/a5c498f8-d7ae-41fe-8259-8e0bbd0af816.png",
  avax: "https://static.sosovalue.com/sosovalue/2025/08/07/9534b32e-f85b-47ce-a247-a616a8792935.png",
  silver: "https://sodex.com/assets/img/tokens/silver.svg",
  zec: "https://static.sosovalue.com/sosponge/droplist/23/06/13/aekdt0j0fwa9.png",
  mstr: "https://sodex.com/assets/img/tokens/mstr.svg",
  tsla: "https://static.sosovalue.com/2026/03/05/a6fdeb5c-f15a-4dad-a944-305a0c406b1d.png",
  skhx: "https://sodex.com/assets/img/tokens/skhx.svg",
  intc: "https://sodex.com/assets/img/tokens/intc.svg",
  google: "https://static.sosovalue.com/2026/03/05/248297c8-c43b-4819-8144-9510b2ee42e0.png",
  msft: "https://sodex.com/assets/img/tokens/msft.svg",
  nvda: "https://static.sosovalue.com/2026/03/05/a70fd06c-aab2-4600-85e6-b1934f0290ac.png",
  meta: "https://static.sosovalue.com/2026/03/05/b94a02bf-878e-4d34-94e2-eb2b04487e08.png",
  aapl: "https://static.sosovalue.com/2026/03/05/013d6da1-9398-429a-a3fa-c1e3e548638f.png",
  copper: "https://sodex.com/assets/img/tokens/copper.svg",
  axs: "https://static.sosovalue.com/sosponge/droplist/23/06/13/12s5t0j0fw1m.png",
  ustech100: "https://sodex.com/assets/img/tokens/ustech100.svg",
  sndk: "https://sodex.com/assets/img/tokens/sndk.svg",
  mu: "https://sodex.com/assets/img/tokens/mu.svg",
  hood: "https://sodex.com/assets/img/tokens/hood.svg",
  amzn: "https://static.sosovalue.com/2026/03/05/a612e0b1-d539-4e26-8eeb-11b7829456dc.png",
  crcl: "https://static.sosovalue.com/sosovalue/2025/07/06/0faa7776-c61e-40d7-b316-1b2ceee80974.png",
  pltr: "https://sodex.com/assets/img/tokens/pltr.svg",
  coin: "https://sodex.com/assets/img/tokens/coin.svg",
  ewy: "https://sodex.com/assets/img/tokens/ewy.svg",
  orcl: "https://sodex.com/assets/img/tokens/orcl.svg",
  amd: "https://sodex.com/assets/img/tokens/amd.svg",
  ton: "https://static.sosovalue.com/sosovalue/2025/08/07/52717eae-5e17-4eaf-bab8-7b632ff7f9c3.jpg",
  soso: "https://static.sosovalue.com/sosovalue/2025/01/24/664617be-cb7b-4dce-8317-4deae2ff0a55.png",
  // SoSoValue index products (.ssi)
  mag7: "https://static.sosovalue.com/sosovalue/2024/12/21/3427fac3-fad7-4f54-b47c-a0e6e231c97c.svg",
  meme: "https://static.sosovalue.com/sosovalue/2024/12/21/3bcf3053-3c44-4ea9-a476-59e72bc1a8fc.svg",
  defi: "https://static.sosovalue.com/sosovalue/2024/12/21/8acfd44e-e0e7-43c8-b980-301f665df279.svg",
  ussi: "https://sosovalue.com/img/ssi/ussi.svg",
  usdc: "https://static.sosovalue.com/sosponge/droplist/23/06/13/x5ywt0j0fwz6.png",
  usdt: "https://static.sosovalue.com/2026/03/05/66f58297-81ec-4b70-b443-8a75c5470410.png",
};

// SoDEX base coin (lowercased) → canonical icon key.
const ALIASES: Record<string, string> = {
  googl: "google",
  us100: "ustech100",
  shkz: "skhx",
  pepe: "1000pepe", // spot lists PEPE, perps lists 1000PEPE
  shib: "1000shib", // spot lists SHIB, perps lists 1000SHIB
  cooper: "copper",
  wsoso: "soso", // wrapped SOSO
  vusdc: "usdc",
  vusdt: "usdt",
  // Index displayName form drops the dot (MAG7ssi / DEFIssi / MEMEssi)
  mag7ssi: "mag7",
  defissi: "defi",
  memessi: "meme",
};

/**
 * Extract the bare base-coin token from any SoDEX symbol/asset string.
 * e.g. "BTC-USD" → "btc", "ETH/USDC" → "eth", "vXAUt_vUSDC" → "xaut",
 *      "vDEFI.ssi" → "defi", "WSOSO" → "wsoso"
 */
export function baseSymbol(raw: string): string {
  let t = (raw || "").trim();
  if (!t) return "";
  // pair separators
  if (t.includes("/")) t = t.split("/")[0];
  else if (t.includes("-")) t = t.split("-")[0];
  else if (t.includes("_")) t = t.split("_")[0];
  // strip vault prefix: lowercase "v" directly before an uppercase letter/digit
  if (/^v[A-Z0-9]/.test(t)) t = t.slice(1);
  // strip the DOTTED SoSoValue index suffix only (vMAG7.ssi → mag7).
  // The no-dot displayName form (MAG7ssi) and standalone USSI are handled via ALIASES,
  // so we never accidentally turn "USSI" into "US".
  t = t.replace(/\.ssi$/i, "");
  return t.toLowerCase();
}

/** Resolve any SoDEX symbol/asset string to an icon URL, or null if unmapped. */
export function getTokenIcon(raw: string): string | null {
  const base = baseSymbol(raw);
  if (!base) return null;
  const key = ALIASES[base] ?? base;
  return ICONS[key] ?? null;
}

/** Short uppercase ticker for fallback badges (e.g. "BTC", "GOOGL"). */
export function tickerLabel(raw: string): string {
  return baseSymbol(raw).toUpperCase();
}
