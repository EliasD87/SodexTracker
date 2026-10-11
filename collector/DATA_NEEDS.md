# SoDEX data inventory

Every SoDEX fetch the site and the collector make, what we use from each, and
where fetches overlap. Kept up to date as features are added, so the VPS setup
can merge overlapping fetches later. **Not optimised yet; this is the list to
optimise from.**

Hosts:

| Host | What | Limits |
|---|---|---|
| `mainnet-gw.sodex.dev` (gateway) | Trading API: markets, accounts, WebSocket | **1200 weight/min per IP** (we cap at 240); WS 10 connections, 30 new/min, 1000 subs |
| `mainnet-data.sodex.dev` (data) | Stats, leaderboard, overviews, history | Unpublished; we pace ourselves (2–4/s) |
| `alpha-biz.sodex.dev` (website backend) | Deposit/withdrawal ledger | Unpublished, undocumented; paced 2/s |
| `sodex.dev/mainnet` | Account ID → address lookup | Unpublished; 1,000 IDs per call |

## Collector (runs on the VPS)

| # | Fetch | Host · cost | How often | Used for | Fields we use | Also returns (unused) |
|---|---|---|---|---|---|---|
| C1 | WS `trade` channel, every market | gw WS | Live | Flow, cohorts, account_day, large trades, **position re-read trigger** | price, qty, side, buyer/seller account IDs, trade ID | — |
| C2 | WS `miniTicker` (one market per engine) | gw WS | Live | Heartbeat only | — | price |
| C3 | `GET /{engine}/markets/symbols` | gw · 2 | 30 min | Market list, names | name, displayName, engine | fees, leverage, tick sizes |
| C4 | `GET /perps/markets/tickers` | gw · 2 | 1 min | ticker_minute: mark, OI, funding | last, mark, index, OI, funding, 24h volume | — |
| C5 | `GET /{engine}/markets/{s}/trades?limit=500` | gw · 20 | On gaps | Backfill missed trades | trades (no accounts) | — |
| C6 | Same, `limit=100` | gw · 20 | 2 min, 4 markets | Completeness check | trade IDs | — |
| C7 | `GET /leaderboard?window_type=30D&sort_by=pnl` | data | 6 h, 5 pages | Smart money group (top 100) | account_id | wallet_address, pnl, volume |
| C8 | `POST /chain/users/addresses` | sodex.dev · 1,000 IDs | 30 min (new IDs only) | Address book (funds + positions) | userId → address | — |
| C9 | `POST /biz/mirror/account_flow` | alpha-biz | Per account: 2 h if active, daily if holding money, weekly otherwise | **Money flow**: deposits/withdrawals | type, status, amount, decimals, coin, chain, tx hash, time | sender/receiver, token, fail reason |
| C10 | `GET /{engine}/markets/{s}/klines?interval=1d` | gw · 20 | Per coin per day, cached | Valuing non-stablecoin deposits | close | OHLC, volume |
| C11 | `GET /leaderboard?window_type=ALL_TIME&sort_by=volume` | data | Daily, all ~2.7K pages | **Positions**: track-record groups, sweep order | account_id, pnl, volume | wallet_address |
| C12 | `GET /wallet/portfolio/overview?window=1Y` | data | Weekly per trader (first pass: all, ~12 h) | **Positions**: find holders (unrealised PnL ≠ 0), equity | account_value, perps_unrealized_pnl | total_pnl, roi, **net_deposit**, spot/vault/closed PnL, volume |
| C13 | `GET /perps/accounts/{addr}/state` | gw · 5 | On fill (settled 20 s, ≤ 1/min) + by size: $1M+ 10 min, $100K+ 1 h, else 6 h | **Positions**: open positions | av (equity), P[]: symbol, size, entry, leverage, liq price, margin mode, opened | **B[] balances (spot holdings, vault)**, **O/TO open orders & TP/SL**, S[] leverage settings, margin figures, ur (unrealised) |

## Site (Next.js server routes, cached)

| # | Fetch | Host · cost | Cache | Used for |
|---|---|---|---|---|
| S1 | `/dashboard/{volume,open-interest,users,unique-traders,trades-count,funding-rate,slippage}` | data | 10 min | Analytics overview, markets, funding, home "in depth" |
| S2 | `POST /mirror/tvl/history` | data | 10 min | TVL, leverage on deposits |
| S3 | `/perps/markets/tickers`, `/spot/markets/tickers`, `mark-prices` | gw · 2 | 30 s | Live marks for positions, market pages, home |
| S4 | `/{engine}/markets/{s}/orderbook?limit=500` | gw · 10 | 15 s | Market page liquidity (slippage, depth) |
| S5 | `/{engine}/markets/symbols` | gw · 2 | 30 min | Fees and leverage per market |
| S6 | `/perps/accounts/{addr}/state`, `/spot/accounts/{addr}/state`, `/balances`, `/positions` | gw · 5 | Per page view | Tracker / portfolio pages |
| S7 | `/wallet/portfolio/overview`, `/wallet/portfolio/chart`, `/perps/trades`, `/spot/trades`, `/perps/positions` | data | Per page view | Tracker / portfolio pages |
| S8 | `/leaderboard`, `/leaderboard/rank` | data | Per page view | Leaderboard, reverse search |
| S9 | `POST /biz/mirror/account_flow` | alpha-biz | Per page view | Tracker fund-flow card |

## Data we store (collector database → Supabase later)

| Table | What | Kept |
|---|---|---|
| flow_minute / flow_hour | Volume and net flow per market, minute, trader group | 48 h minute, hourly forever |
| account_day | Per account, market, day: bought/sold, maker/taker, fills | Forever (used for groups, active traders) |
| large_trades | Trades ≥ $50K | Forever |
| ticker_minute / ticker_hour | Mark, index, OI, funding per perp | 48 h minute, hourly forever |
| cohorts | Account → trader group | Current |
| fund_accounts | Account → address, ledger read times | Current |
| fund_flows | Every deposit/withdrawal | Forever |
| fund_prices | Daily price per coin | Forever |
| pos_accounts | Equity, all-time PnL/volume, snapshot schedule | Current |
| open_positions | Every open perps position | Current (replaced per account) |

## Overlaps to merge later

1. **C13 state already returns balances and open orders.** Spot holdings, vault
   deposits, rich list (equity) and order clusters (limit / TP / SL levels, like
   HyperTracker's Market Radar) come free with every position snapshot.
2. **C12 overview returns net deposits and account value.** Could replace C9's
   "holding money" schedule (re-read the ledger only when net deposits change)
   and seed size groups for non-holders.
3. **C7 and C11 are the same endpoint.** One daily leaderboard pass can cover
   30D PnL (smart money) and all-time PnL/volume.
4. **C9 and C13 share a trigger.** An account that just traded may have moved
   money too; schedule both from the same fill signal.
5. **C4 vs S3.** On the VPS the site can read the collector's minute tickers
   instead of fetching its own.
6. **C10 klines vs C4/ticker_hour.** Once the collector has run a while, daily
   prices for valuing deposits can come from our own hourly tickers; klines are
   only needed for history before that.
7. **C8 address book** is shared by funds and positions already.
8. **Followed accounts (alerts) deserve faster snapshots.** Today a fill
   triggers the re-read for everyone equally; on the VPS, accounts with
   followers could skip the 20 s settle or get a shorter scheduled refresh.
9. **Liquidations could be confirmed** instead of inferred if SoDEX's position
   history (`/perps/accounts/{addr}/positions/history`, gw · 20) marks them; worth
   checking once, then only for "likely liquidated" events.
10. **Account-level page views (S6/S7)** could read the collector's latest
   snapshot for accounts it already tracks instead of hitting SoDEX.

## Feature log

| Feature | Needs |
|---|---|
| Analytics overview / markets / funding | S1, S2, S3, S5 |
| Market pages | S1, S3, S4; live groups from C1 |
| Money flow | C8, C9, C10, S2 |
| Positions (groups, heatmap, liquidation map, at risk) | C1 trigger, C8, C11, C12, C13, S3 |
| Markets table positioning columns (% long, whale share, whale lean) | Same as Positions, no extra fetch |
| Rankings (biggest positions, rich list, unrealised winners/losers, exposure, all-time PnL, depositors) | Same as Positions + Money flow, no extra fetch |
| Trader pages (by nickname) | Same as Positions + Money flow + C1 (activity), no extra fetch |
| Telegram alerts | Events from C13 snapshot diffs and C9 new ledger entries; Telegram Bot API (getUpdates, sendMessage), not SoDEX |
| Funding & risk: likely liquidations, mark vs index | account_events (from C13 diffs), ticker_minute/hour (C4); no extra fetch |
| Market pages: who is positioned, who drives the volume | open_positions (C13), account_day (C1); no extra fetch |
| Traders: group shares, retention, most active, find a trader | account_day + cohorts (C1, C7); no extra fetch |
| Overview: positioning and money-flow panels | Same as Positions and Money flow; no extra fetch |
