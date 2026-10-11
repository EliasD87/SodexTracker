import { config } from "./config.mjs";
import { log } from "./log.mjs";
import { guardedJson } from "./health.mjs";

/**
 * REST access to SoDEX with our own weight budget enforced before every call.
 * SoDEX counts weight per IP per minute; we stop well short of its limit and
 * wait for the next window rather than risk a ban that would also hit anything
 * else sharing the IP.
 */

const MINUTE = 60_000;
/**
 * Every spend in the last minute, as [time, weight]. A sliding window keeps
 * the cap true over any 60 seconds: fixed windows let the end of one and the
 * start of the next both spend in full, doubling the real rate.
 */
const spends = [];
let blockedUntil = 0;
export const restStats = { weight: 0, calls: 0, failures: 0, throttled: 0 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function reserve(weight) {
  for (;;) {
    const now = Date.now();
    if (now < blockedUntil) {
      await sleep(blockedUntil - now);
      continue;
    }
    while (spends.length && now - spends[0][0] >= MINUTE) spends.shift();
    const used = spends.reduce((a, [, w]) => a + w, 0);
    if (used + weight <= config.limits.restWeightPerMinute) {
      spends.push([now, weight]);
      restStats.weight += weight;
      return;
    }
    // Wait for the oldest spend to age out of the window.
    await sleep(spends[0][0] + MINUTE - now + 20);
  }
}

/**
 * GET a SoDEX endpoint. Gateway calls cost `weight`; the data API is a
 * separate host with no published weight, so it is charged nothing here.
 */
export async function get(url, weight = 0) {
  if (weight > 0) await reserve(weight);
  restStats.calls++;
  try {
    // Waits out a paused (down) service and classifies failures; see health.mjs.
    const { res, json } = await guardedJson(url, { headers: { Accept: "application/json" } }, config.limits.requestTimeoutMs);
    if (res.status === 429) {
      restStats.throttled++;
      log.warn("rest", `429 from ${url} — backing off a full minute`);
      // Nothing else goes out for a full minute.
      blockedUntil = Date.now() + MINUTE;
      throw new Error("rate limited");
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    if (json?.code !== 0 && json?.code !== "0") throw new Error(json?.error ?? json?.message ?? "API error");
    return json.data;
  } catch (err) {
    restStats.failures++;
    throw err;
  }
}

export const gw = (path, weight) => get(`${config.gateway}${path}`, weight);
export const dataApi = (path) => get(`${config.dataApi}${path}`, 0);
