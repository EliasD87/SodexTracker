# SoDEX collector

Listens to every trade on every SoDEX market and keeps the figures the
analytics pages need: flow by trader group, per-account daily totals, large
trades, and a once-a-minute market snapshot. No dependencies beyond Node 22.5+
(it uses the built-in `node:sqlite`).

```bash
node collector/src/index.mjs        # run; Ctrl+C flushes and exits
node collector/src/report.mjs       # health report, safe while running
node collector/src/reconcile.mjs    # check our numbers against SoDEX's own candles
```

Data goes to `collector/data/collector.db` (git-ignored). The website reads it
through `src/lib/liveStore.ts`.

## What it costs

Measured locally across 142 markets:

| | |
|---|---|
| Trades | ~600 a minute (~850,000 a day) |
| Download | ~100–130 KB a minute (~180 MB a day) |
| Memory | ~70–80 MB |
| CPU | ~1% of one core |
| SoDEX REST weight | ~25 a minute steady; up to the cap while backfilling |
| SoDEX WebSockets | 2 connections, ~145 subscriptions |

## Staying out of a trading bot's way

SoDEX limits are per IP, so the collector caps itself well inside them:

- **REST weight:** 240 a minute on a sliding window (SoDEX allows 1200).
  Raise with `COLLECTOR_REST_WEIGHT` only if the collector has its own IP.
- **New connections:** at most 6 a minute (SoDEX allows 30). Reconnects back
  off from 2 seconds to 5 minutes, so a fault can't turn into a loop.
- **A 429 from SoDEX** stops all REST calls for a full minute.

## Continuity

Trade IDs run consecutively per market, so any missed trade shows up as a gap.

- Gaps are refilled from REST (busiest market first, since REST only keeps a
  market's last 500 trades). Refilled trades carry no accounts and are stored
  as "unattributed" rather than guessed into a group.
- Each market's position is saved with every flush (every 15 seconds), so after
  a crash or reboot the collector resumes and refills what it missed.
- Gaps still owed are re-queued on restart; a gap's status is saved in the
  same transaction as the trades that filled it.

## Verification

- **Completeness** (`coverage` in the stats line): every two minutes, SoDEX's
  own latest trades for a few markets are checked against what arrived live.
- **Accuracy** (`reconcile.mjs`): per-minute volume and trade count compared
  with SoDEX's 1-minute candles.
- **Failure test:** `COLLECTOR_CHAOS_MS=120000` cuts one live connection every
  two minutes. Reconnects and backfill should leave `reconcile.mjs` exact.

## Deposits and withdrawals

Off unless `COLLECTOR_FUNDS=1`. SoDEX publishes no exchange-wide figure, so
the collector reads every account's own deposit and withdrawal history (the
record behind sodex.com's transfer history) and adds them up.

- **Account list:** SoDEX's ID-to-address lookup, 1,000 accounts per call,
  covering every account, including ones that never traded. New accounts are
  picked up every 30 minutes.
- **First run:** every ledger once, everything since launch. About 230,000
  accounts at 2 reads a second: a day or two. Meant for the server.
- **Then:** accounts that traded today are re-read every 2 hours, accounts
  still holding money daily, everyone else weekly.
- **Exact:** each movement is stored once under an ID built from the ledger
  entry, so re-reading never double counts. Only completed movements count.
- **Valued** at $1 for stablecoins, otherwise at SoDEX's daily close for the
  asset on the day it moved (staked tokens and tokenised stocks as what they
  wrap).
- **Separate lane:** a different SoDEX host from the trading API, paced on its
  own; it never touches the REST weight a trading bot shares.

`node collector/src/funds-sample.mjs 300` reads the 300 busiest accounts into
the local database to check the numbers without the full run.

SoDEX's per-account "net deposit" is not a ledger: it is account value minus
profit, so it also absorbs anything SoDEX doesn't book as profit. Expect it to
differ from these figures.

## Open positions

Off unless `COLLECTOR_POSITIONS=1`. Every open perps position, for group
positioning, liquidation maps and positions at risk. Fetches as little as it can:

- **Changes come from the trade stream.** A position only changes through a
  fill, and every fill names both accounts, so a fill queues those two for a
  re-read (after 20 seconds, at most once a minute each). Nothing is polled.
- **Price moves cost nothing.** The site values positions at live mark prices,
  so unrealised PnL, bias and distance to liquidation stay current without
  re-reading anything.
- **Scheduled re-reads by size**, because cross-margin liquidation prices
  drift: $1M+ every 10 minutes, $100K+ hourly, the rest every 6 hours.
- **Finding holders who haven't traded since we started:** a sweep of every
  trader's overview on SoDEX's data host (no REST weight), busiest first,
  weekly; unrealised PnL means an open position. About half a day at first.
- **Track records:** all-time PnL for every trader from the leaderboard, daily.
- Only the snapshot itself uses the trading API: 5 weight, on its own lane,
  `COLLECTOR_POSITIONS_WEIGHT` per minute (120 by default, 24 snapshots).

`node collector/src/positions-sample.mjs 1000` sweeps the 1,000 busiest traders
and snapshots the ones holding positions, to check the numbers locally.

## Telegram alerts

Off unless `TELEGRAM_BOT_TOKEN` is set (create a bot with @BotFather). People
follow traders by nickname and get a message when they open, add to, cut,
close or flip a position, are likely liquidated, or move money in or out.

- **Events** come from comparing each position snapshot with the previous one
  (never on an account's first snapshot) and from new ledger entries (recent
  ones, on re-reads only). Stored in `account_events`.
- **Speed:** a trade triggers the re-read 20–80 seconds later, so alerts follow
  within about a minute and a half.
- **"Likely liquidated":** a close or cut at (within 1% of) the old
  liquidation price. SoDEX liquidates through the order book, so trades carry
  no liquidation flag.
- **Bot:** long polling, no public URL needed. `/start <name>` (what the site's
  button sends), `/follow`, `/unfollow`, `/list`, `/min <usd>`. Up to 20
  traders per chat; chats that block the bot are dropped. Never sends a backlog.
- **Privacy:** messages carry nicknames only. `src/nickname.mjs` must stay
  identical to the site's `src/lib/nickname.ts`; the test checks it.

`node collector/src/alerts-test.mjs` checks the whole pipeline on a throwaway
database, with no SoDEX or Telegram calls.

The site's button needs `NEXT_PUBLIC_TELEGRAM_BOT` (the bot's username);
without it, trader pages show "Alerts coming soon".

## Settings

| Variable | Default | |
|---|---|---|
| `COLLECTOR_DB` | `collector/data/collector.db` | Database path |
| `COLLECTOR_REST_WEIGHT` | `240` | REST weight per minute (max 1000) |
| `COLLECTOR_CHAOS_MS` | `0` (off) | Testing only: cut a connection this often |
| `COLLECTOR_FUNDS` | off | `1` to read deposits and withdrawals |
| `COLLECTOR_FUNDS_RPS` | `2` | Ledger reads per second |
| `COLLECTOR_POSITIONS` | off | `1` to track open positions |
| `COLLECTOR_POSITIONS_WEIGHT` | `120` | REST weight per minute for snapshots |
| `TELEGRAM_BOT_TOKEN` | unset (off) | Bot token for alerts |
| `SITE_URL` | unset | Site address, for links in alerts |
| `NICKNAME_MUL` / `NICKNAME_ADD` | built in | Nickname scramble; set the same on site and collector, keep secret |

Everything else is in `src/config.mjs`.
