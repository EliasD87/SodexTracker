# SoDEX collector on the VPS

Two services that run next to your trading bots without touching them:

- **sodex-collector** listens to every SoDEX trade and, when switched on, reads
  deposits/withdrawals and open positions. Everything goes into one SQLite
  file on the VPS.
- **sodex-publisher** turns that file into the site's live views and pushes
  them to Supabase (one small table), only when they change.

**Kept apart from the bots:**
- **Own account:** a separate Linux user (`collector`), with its own Node in its home folder. No root, no system packages, nothing installed globally.
- **No incoming connections:** no open ports; everything is outgoing.
- **Lowest priority:** CPU capped at 60% and 100% of one core, memory capped at 1.5 GB and 2.5 GB (4 GB of the 8 GB server at most), lowest IO priority.
- **Request cap:** SoDEX REST is capped at 240 of the IP's 1200 weight a minute, and it backs off a full minute on any rate-limit reply. It uses 2 of SoDEX's 10 WebSocket connections per IP.

Commands marked **(root)** run as root; everything else runs as `collector`.

---

## 1. Upload (from your PC)

In PowerShell, from the project folder:

```bash
scp deploy/sodex-vps.tar.gz root@YOUR_VPS_IP:/tmp/
```

## 2. Create the collector user (root)

```bash
adduser --disabled-password --gecos "" collector
```
```bash
loginctl enable-linger collector
```

`enable-linger` lets its services run without anyone logged in and start on reboot.

## 3. Unpack and install (as collector)

```bash
su - collector
```
```bash
tar -xzf /tmp/sodex-vps.tar.gz -C ~
```
```bash
cd ~/sodex && bash install.sh
```

If `su` complains about the user bus, run `export XDG_RUNTIME_DIR=/run/user/$(id -u)` and try again.
Every later step assumes you're `collector` in `~/sodex` with that variable set:

```bash
export XDG_RUNTIME_DIR=/run/user/$(id -u)
```

## 4. Create the Supabase table (in the browser)

Supabase → your project → **SQL Editor** → New query → paste the contents of
`supabase.sql` → **Run**. It creates `live_snapshots`, readable by anyone and
writable only with the service key.

## 5. Fill in the settings

```bash
nano ~/sodex/.env
```

Set at least `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (Supabase →
Project Settings → API). Leave `COLLECTOR_FUNDS=0` and `COLLECTOR_POSITIONS=0`
for now. Save with Ctrl+O, Enter, Ctrl+X.

## 6. Start the collector alone and watch it for a day

```bash
systemctl --user enable --now sodex-collector
```
```bash
tail -f ~/sodex/logs/collector.log
```

A healthy line, once a minute:
`stats  612 trades/min · 105 KB/min · rss 78 MB · cpu 0.9% · rest 24 wt/min · ... coverage 99.9% · gaps 0`

**Meanwhile, watch your bots** for any rate-limit errors (HTTP 429). If one
appears, set `COLLECTOR_REST_WEIGHT=120` in `.env` and
`systemctl --user restart sodex-collector`.

Full health check any time:

```bash
bash ~/sodex/status.sh
```

## 7. Start publishing

```bash
systemctl --user enable --now sodex-publisher
```
```bash
tail -f ~/sodex/logs/publisher.log
```

You should see `N view(s) written` within a minute, and rows appearing in
Supabase → Table Editor → `live_snapshots`.

## 8. Switch on deposits, then positions (one at a time)

Deposits first. Edit `.env` → `COLLECTOR_FUNDS=1`, then:

```bash
systemctl --user restart sodex-collector
```

The first pass reads every account's history (a day or two). Progress shows
in the log every 10 minutes (`ledgers read N/232,000`) and in `status.sh`.

When that's settled, positions: `COLLECTOR_POSITIONS=1`, restart again. The
first pass checks every trader (about half a day).

## 9. Telegram alerts (optional)

Create a bot with @BotFather, put its token in `TELEGRAM_BOT_TOKEN` and the
site's address in `SITE_URL`, restart the collector. The site's "Get alerts"
button needs the bot's username as `NEXT_PUBLIC_TELEGRAM_BOT` on the site.

## 10. Test on your own PC (not the live site)

In the project's `.env.local` on your PC, add one line:

```
LIVE_SOURCE=snapshots
```

then run the site locally (`npm run dev`) and open http://localhost:3000. The
analytics pages now read the live views the VPS publishes to Supabase. Remove
the line to go back to the local database. The live site is untouched until
we deploy it with the same setting.

## When SoDEX is under maintenance

Nothing to do. What happens on its own:

- **Live trades:** the connection drops and retries, waiting 2 s, then longer, up to 5 min between tries.
- **SoDEX requests:** after 5 failures in a row, calls to that SoDEX service pause for 1, 2, 5, then 10 min, logged once (`not answering ... pausing calls until`), and resume on the first good answer (`answering again`).
- **Bad account reads:** a half-empty reply is rejected, so the last good positions stay and no false "closed" alerts go out.
- **Renumbered trades:** if SoDEX restarts or renumbers trade IDs, the collector follows the new numbering and logs it.
- **The site:** it shows a notice ("No trades from SoDEX since 08:31 UTC ...") and turns the live dots grey until data flows again.
- **Trades missed while disconnected:** they're refilled from SoDEX's recent trades. A market that traded more than 500 times while we were offline keeps a gap, counted in `status.sh`.

---

## Everyday

| | |
|---|---|
| Health | `bash ~/sodex/status.sh` |
| Logs | `tail -f ~/sodex/logs/collector.log` (or `publisher.log`) |
| Restart | `systemctl --user restart sodex-collector sodex-publisher` |
| Stop | `systemctl --user stop sodex-publisher sodex-collector` |
| Accuracy check | `cd ~/sodex && set -a && . ./.env && set +a && ~/.local/node/bin/node collector/src/reconcile.mjs` |

**Update** to a new package (data and `.env` are kept):

```bash
systemctl --user stop sodex-publisher sodex-collector
```
```bash
tar -xzf /tmp/sodex-vps.tar.gz -C ~ && cd ~/sodex && bash install.sh
```
```bash
systemctl --user start sodex-collector sodex-publisher
```

**Remove everything (root):**

```bash
loginctl disable-linger collector && pkill -u collector; deluser --remove-home collector
```

## What it uses

| | |
|---|---|
| Disk | ~5 MB a day long term (minute detail rolls into hourly after 48 h); ~150 MB for the deposit history once read; logs capped at 10 MB each (trimmed daily) |
| Memory | ~80–150 MB collector, ~100 MB publisher |
| CPU | ~1% of one core steady; more during first passes |
| Network | ~150 MB a day download from SoDEX; a few MB a day up to Supabase |
| SoDEX REST | ≤ 240 weight a minute (snapshots ≤ 120 of that) |
| Supabase | one table, tens of MB; writes only on change |
