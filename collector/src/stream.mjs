import { config } from "./config.mjs";
import { log } from "./log.mjs";
import { sql } from "./db.mjs";

/**
 * One self-healing WebSocket per engine.
 *
 * - Subscribes to trades for every market, plus one market's miniTicker as a
 *   heartbeat: it arrives every few seconds, so silence means a dead socket.
 * - Reconnects with exponential back-off and jitter.
 * - All engines share one cap on new connections per minute, so a reconnect
 *   loop can never spend the IP's connection allowance.
 */

const MINUTE = 60_000;
const recentConnects = [];
export const streamStats = { messages: 0, bytes: 0, reconnects: 0 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function connectSlot() {
  for (;;) {
    const now = Date.now();
    while (recentConnects.length && now - recentConnects[0] > MINUTE) recentConnects.shift();
    if (recentConnects.length < config.limits.newConnectionsPerMinute) {
      recentConnects.push(now);
      return;
    }
    await sleep(recentConnects[0] + MINUTE - now + 100);
  }
}

export class EngineStream {
  /**
   * @param {"perps"|"spot"} engine
   * @param {() => string[]} symbols  API names to subscribe trades for
   * @param {(engine: string, trade: object) => void} onTrade
   */
  constructor(engine, symbols, onTrade) {
    this.engine = engine;
    this.symbols = symbols;
    this.onTrade = onTrade;
    this.ws = null;
    this.subscribed = new Set();
    this.attempt = 0;
    this.lastMessageAt = 0;
    this.stopped = false;
    this.watchdog = null;
  }

  record(event, detail = "") {
    sql.connection.run(Date.now(), this.engine, event, detail);
  }

  async start() {
    while (!this.stopped) {
      await connectSlot();
      if (this.stopped) return;
      await this.runOnce();
      if (this.stopped) return;
      streamStats.reconnects++;
      const base = Math.min(config.stream.backoffMaxMs, config.stream.backoffMinMs * 2 ** this.attempt);
      const wait = Math.round(base * (0.8 + Math.random() * 0.4));
      this.attempt++;
      log.warn(this.engine, `disconnected; reconnecting in ${(wait / 1000).toFixed(1)}s (attempt ${this.attempt})`);
      await sleep(wait);
    }
  }

  runOnce() {
    return new Promise((resolve) => {
      const ws = new WebSocket(config.ws[this.engine]);
      this.ws = ws;
      this.subscribed = new Set();
      let settled = false;
      const finish = (event, detail) => {
        if (settled) return;
        settled = true;
        clearInterval(this.watchdog);
        this.record(event, detail);
        try {
          ws.close();
        } catch {
          /* already closed */
        }
        resolve();
      };

      ws.addEventListener("open", () => {
        this.lastMessageAt = Date.now();
        this.record("open");
        log.info(this.engine, "connected");
        ws.send(
          JSON.stringify({ op: "subscribe", id: 1, params: { channel: "miniTicker", symbols: [config.stream.heartbeat[this.engine]] } }),
        );
        this.subscribeNew();
        this.watchdog = setInterval(() => {
          if (Date.now() - this.lastMessageAt > config.stream.idleTimeoutMs) finish("idle", "no message within the idle timeout");
        }, 5_000);
      });

      ws.addEventListener("message", (ev) => {
        this.lastMessageAt = Date.now();
        streamStats.messages++;
        streamStats.bytes += ev.data.length;
        let msg;
        try {
          msg = JSON.parse(ev.data);
        } catch {
          return;
        }
        if (msg.op) {
          if (msg.success === false) log.warn(this.engine, `subscribe failed: ${msg.error}`);
          return;
        }
        if (msg.channel === "trade") {
          // A healthy stream resets the back-off.
          this.attempt = 0;
          for (const t of msg.data ?? []) this.onTrade(this.engine, t);
        }
      });

      ws.addEventListener("error", () => finish("error", "socket error"));
      ws.addEventListener("close", (ev) => finish("close", `code ${ev.code}`));
    });
  }

  /** Subscribe to any market not yet covered on this connection. */
  subscribeNew() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const fresh = this.symbols().filter((s) => !this.subscribed.has(s));
    if (!fresh.length) return;
    // Chunked, so one rejected symbol can't sink the whole subscription.
    for (let i = 0; i < fresh.length; i += 50) {
      const chunk = fresh.slice(i, i + 50);
      this.ws.send(JSON.stringify({ op: "subscribe", id: 2 + i, params: { channel: "trade", symbols: chunk } }));
      chunk.forEach((s) => this.subscribed.add(s));
    }
    log.info(this.engine, `subscribed to trades on ${fresh.length} market(s)`);
  }

  /** Cut the live connection, as a dropped network would. Testing only. */
  drop() {
    if (this.ws?.readyState === WebSocket.OPEN) {
      log.warn(this.engine, "chaos test: cutting the connection");
      this.ws.close();
    }
  }

  stop() {
    this.stopped = true;
    clearInterval(this.watchdog);
    try {
      this.ws?.close();
    } catch {
      /* already closed */
    }
  }
}
