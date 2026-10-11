import { config } from "./config.mjs";
import { db } from "./db.mjs";
import { log } from "./log.mjs";
import { accountOf, nickname } from "./nickname.mjs";
import { describe } from "./events.mjs";

/**
 * Telegram alerts: people follow a trader by nickname and get a message when
 * that trader opens, adds to, cuts, closes or flips a position, is likely
 * liquidated, or moves money in or out.
 *
 * Long polling (getUpdates), so the bot needs no public URL or webhook. Only
 * nicknames are ever sent; the bot never learns or reveals an address.
 *
 *   /start <name>   follow (what the site's "Get alerts" button sends)
 *   /follow <name>  follow
 *   /unfollow <name>|all
 *   /list           who you follow
 *   /min <usd>      only changes of at least this size
 */

const q = {
  get: db.prepare("SELECT value FROM kv WHERE key = ?"),
  set: db.prepare("INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value"),
  follow: db.prepare(`
    INSERT INTO alert_subs (chat_id, account_id, min_usd, created_at)
    VALUES (?, ?, COALESCE((SELECT min_usd FROM alert_subs WHERE chat_id = ? LIMIT 1), 0), ?)
    ON CONFLICT (chat_id, account_id) DO NOTHING`),
  unfollow: db.prepare("DELETE FROM alert_subs WHERE chat_id = ? AND account_id = ?"),
  unfollowAll: db.prepare("DELETE FROM alert_subs WHERE chat_id = ?"),
  list: db.prepare("SELECT account_id, min_usd FROM alert_subs WHERE chat_id = ? ORDER BY created_at"),
  count: db.prepare("SELECT COUNT(*) n FROM alert_subs WHERE chat_id = ?"),
  setMin: db.prepare("UPDATE alert_subs SET min_usd = ? WHERE chat_id = ?"),
  maxEvent: db.prepare("SELECT COALESCE(MAX(id), 0) id FROM account_events"),
  events: db.prepare("SELECT * FROM account_events WHERE id > ? ORDER BY id LIMIT 200"),
  subsFor: db.prepare("SELECT chat_id, min_usd FROM alert_subs WHERE account_id = ?"),
};

const kv = (key) => q.get.get(key)?.value ?? null;
const setKv = (key, value) => q.set.run(key, String(value));

const traderLink = (name) => (config.alerts.siteUrl ? `${config.alerts.siteUrl}/analytics/trader/${name}` : null);

const HELP = [
  "Follow SoDEX traders by nickname and get a message when they trade or move money.",
  "",
  "/follow <name>: follow a trader",
  "/unfollow <name>: stop (or /unfollow all)",
  "/list: who you follow",
  "/min <usd>: only changes of at least this size, e.g. /min 10000",
  "",
  "Names are nicknames from the SoDEX Tracker site. Addresses are never shown.",
].join("\n");

/** One command from one chat; returns the reply. No network, so it can be tested. */
export function handleCommand(chatId, text) {
  const [rawCmd, ...args] = String(text ?? "").trim().split(/\s+/);
  const cmd = rawCmd.split("@")[0].toLowerCase();
  const arg = args.join(" ").trim().toLowerCase();

  const follow = (name) => {
    const id = accountOf(name);
    if (id == null) return `"${name}" isn't a trader name. Copy it from a trader's page on the site.`;
    if (q.count.get(chatId).n >= config.alerts.maxFollows) return `You can follow up to ${config.alerts.maxFollows} traders. /unfollow one first.`;
    q.follow.run(chatId, id, chatId, Date.now());
    const link = traderLink(nickname(id));
    return `Following ${nickname(id)}. You'll get a message when they trade or move money.${link ? `\n${link}` : ""}`;
  };

  switch (cmd) {
    case "/start":
      return arg ? follow(arg) : HELP;
    case "/help":
      return HELP;
    case "/follow":
      return arg ? follow(arg) : "Send /follow <name>, e.g. /follow quiet-falcon-bloom";
    case "/unfollow": {
      if (arg === "all") {
        q.unfollowAll.run(chatId);
        return "Unfollowed everyone.";
      }
      const id = arg ? accountOf(arg) : null;
      if (id == null) return "Send /unfollow <name>, or /unfollow all.";
      return q.unfollow.run(chatId, id).changes ? `Unfollowed ${nickname(id)}.` : `You weren't following ${nickname(id)}.`;
    }
    case "/list": {
      const rows = q.list.all(chatId);
      if (!rows.length) return "You aren't following anyone yet. Send /follow <name>.";
      const min = rows[0].min_usd;
      return [`Following ${rows.length}:`, ...rows.map((r) => `• ${nickname(r.account_id)}`), min > 0 ? `Only changes of $${min.toLocaleString("en-US")} or more.` : ""]
        .filter(Boolean)
        .join("\n");
    }
    case "/min": {
      const n = Number(arg.replace(/[$,k]/gi, "")) * (/k$/i.test(arg) ? 1000 : 1);
      if (!Number.isFinite(n) || n < 0) return "Send /min <usd>, e.g. /min 10000 (or /min 0 for everything).";
      q.setMin.run(n, chatId);
      return n > 0 ? `Only changes of $${n.toLocaleString("en-US")} or more from now on.` : "You'll get every change from now on.";
    }
    default:
      return HELP;
  }
}

/** Alerts due since the cursor, as [{ chatId, text }], and the new cursor. No network. */
export function pendingAlerts(cursor) {
  const out = [];
  let last = cursor;
  for (const e of q.events.all(cursor)) {
    last = e.id;
    const subs = q.subsFor.all(e.account_id);
    if (!subs.length) continue;
    const name = nickname(e.account_id);
    const link = traderLink(name);
    const text = describe(name, {
      kind: e.kind,
      market: e.market,
      side: e.side,
      sizeBefore: e.size_before,
      sizeAfter: e.size_after,
      usd: e.usd,
      price: e.price,
      leverage: e.leverage,
      liquidated: !!e.liquidated,
      detail: e.detail,
    });
    for (const s of subs) {
      if ((e.usd ?? 0) < s.min_usd) continue;
      out.push({ chatId: s.chat_id, text: link ? `${text}\n${link}` : text });
    }
  }
  return { alerts: out, cursor: last };
}

/* ── Network ────────────────────────────────────────────────────────────── */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function tg(method, body, timeoutMs = 15_000) {
  const res = await fetch(`https://api.telegram.org/bot${config.alerts.token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const json = await res.json().catch(() => ({}));
  if (!json.ok) {
    const err = new Error(json.description ?? `HTTP ${res.status}`);
    err.code = json.error_code ?? res.status;
    throw err;
  }
  return json.result;
}

async function send(chatId, text) {
  try {
    await tg("sendMessage", { chat_id: chatId, text, disable_web_page_preview: true });
  } catch (err) {
    if (err.code === 403) {
      // The person blocked the bot: stop sending to them.
      q.unfollowAll.run(chatId);
      log.info("alerts", `chat ${chatId} blocked the bot; its follows were removed`);
    } else if (err.code === 429) {
      await sleep(5_000);
    } else {
      log.warn("alerts", `send failed: ${err.message}`);
    }
  }
}

/** Run the bot until stopped: answer commands and deliver alerts. */
export function startTelegram(isStopped) {
  // Start from now: never send a backlog of old events.
  if (kv("alert_cursor") == null) setKv("alert_cursor", q.maxEvent.get().id);

  (async () => {
    let offset = Number(kv("tg_offset") ?? 0);
    while (!isStopped()) {
      try {
        const updates = await tg("getUpdates", { offset, timeout: 50, allowed_updates: ["message"] }, 60_000);
        for (const u of updates) {
          offset = u.update_id + 1;
          const m = u.message;
          if (m?.chat?.id && typeof m.text === "string") await send(m.chat.id, handleCommand(m.chat.id, m.text));
        }
        setKv("tg_offset", offset);
      } catch (err) {
        log.warn("alerts", `polling failed: ${err.message}`);
        await sleep(5_000);
      }
    }
  })();

  (async () => {
    while (!isStopped()) {
      try {
        const { alerts, cursor } = pendingAlerts(Number(kv("alert_cursor")));
        for (const a of alerts) {
          await send(a.chatId, a.text);
          await sleep(50); // well under Telegram's 30 messages a second
        }
        setKv("alert_cursor", cursor);
      } catch (err) {
        log.error("alerts", err.stack ?? err.message);
      }
      await sleep(5_000);
    }
  })();
  log.info("alerts", "Telegram bot running");
}
