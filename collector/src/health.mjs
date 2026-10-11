import { db } from "./db.mjs";
import { log } from "./log.mjs";

/**
 * Riding out SoDEX maintenance and outages, per service (gateway, data
 * service, transfer history, address lookup).
 *
 * Five failures in a row that look like an outage (no answer, a timeout, a
 * 5xx, a page that isn't JSON) pause every call to that service: 1 minute,
 * then 2, 5 and 10 between tries, instead of each job retrying on its own.
 * The first answer closes it again. Each pause is logged once and stored, so
 * the site can say the live data has paused and since when.
 *
 * Errors SoDEX answers properly (a 400, an error code in the JSON) are not
 * outages and never pause anything.
 */

const PAUSES = [60_000, 120_000, 300_000, 600_000];
const THRESHOLD = 5;

/** host → { fails, step, openUntil, since, lastError } */
const state = new Map();

const kvSet = db.prepare("INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value");
const kvDel = db.prepare("DELETE FROM kv WHERE key = ?");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clock = (ms) => new Date(ms).toISOString().slice(11, 16);

export const hostOf = (url) => {
  try {
    return new URL(url).host;
  } catch {
    return "unknown";
  }
};

/** An error that means the service isn't there, as opposed to a proper refusal. */
export class Outage extends Error {}

/** Wait while the service is paused. */
export async function guard(host) {
  const s = state.get(host);
  if (s && s.openUntil > Date.now()) await sleep(s.openUntil - Date.now());
}

export function ok(host) {
  const s = state.get(host);
  if (!s) return;
  if (s.since) log.info("upstream", `${host} is answering again (down since ${clock(s.since)} UTC)`);
  state.delete(host);
  kvDel.run(`upstream:${host}`);
}

export function fail(host, err) {
  if (!(err instanceof Outage)) return;
  const now = Date.now();
  const s = state.get(host) ?? { fails: 0, step: 0, openUntil: 0, since: 0, lastError: "" };
  s.fails++;
  s.lastError = err.message;
  if (s.fails >= THRESHOLD && now >= s.openUntil) {
    const pause = PAUSES[Math.min(s.step, PAUSES.length - 1)];
    s.since ||= now;
    s.openUntil = now + pause;
    s.step++;
    log.warn("upstream", `${host} not answering (${err.message}); pausing calls until ${clock(s.openUntil)} UTC`);
    kvSet.run(`upstream:${host}`, JSON.stringify({ since: s.since, retryAt: s.openUntil, error: err.message }));
  }
  state.set(host, s);
}

export const anyDown = () => [...state.values()].some((s) => s.openUntil > Date.now());

/**
 * fetch() with the outage switch: waits while the host is paused, classifies
 * failures, and parses JSON. Proper refusals throw a plain Error; outages
 * throw Outage.
 */
export async function guardedJson(url, init = {}, timeoutMs = 10_000) {
  const host = hostOf(url);
  await guard(host);
  let res;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    const e = new Outage(err.name === "TimeoutError" ? "timed out" : `no answer (${err.cause?.code ?? err.message})`);
    fail(host, e);
    throw e;
  }
  if (res.status >= 500) {
    const e = new Outage(`HTTP ${res.status}`);
    fail(host, e);
    throw e;
  }
  let json;
  try {
    json = await res.json();
  } catch {
    // Maintenance pages come back as HTML.
    const e = new Outage(`HTTP ${res.status}, not JSON`);
    fail(host, e);
    throw e;
  }
  ok(host);
  return { res, json };
}
